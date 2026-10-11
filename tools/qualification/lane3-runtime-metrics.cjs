'use strict';

const { execFileSync } = require('node:child_process');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const numberList = values => [...new Set((values || []).map(Number).filter(value => Number.isInteger(value) && value > 0))];

function windowsPortPid(port) {
    if (!Number.isInteger(Number(port))) return 0;
    try {
        const script = `$p=(Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if($p){$p}`;
        return Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim()) || 0;
    } catch { return 0; }
}

function posixPortPid(port) {
    if (!Number.isInteger(Number(port))) return 0;
    for (const [command, args] of [
        ['lsof', ['-nP', `-iTCP:${Number(port)}`, '-sTCP:LISTEN', '-t']],
        ['fuser', [`${Number(port)}/tcp`]]
    ]) {
        try {
            const text = execFileSync(command, args, { encoding: 'utf8' });
            const pid = Number(String(text).match(/\d+/)?.[0]);
            if (pid) return pid;
        } catch {}
    }
    return 0;
}

function portPid(port) { return process.platform === 'win32' ? windowsPortPid(port) : posixPortPid(port); }

function windowsSnapshot(rootPids) {
    if (!rootPids.length) return [];
    try {
        const roots = rootPids.join(',');
        const script = [
            `$roots=@(${roots})`,
            '$rows=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,KernelModeTime,UserModeTime,CreationDate',
            '$keep=New-Object System.Collections.Generic.HashSet[int]',
            '$roots | ForEach-Object {[void]$keep.Add([int]$_)}',
            'do {$changed=$false; foreach($r in $rows){if($keep.Contains([int]$r.ParentProcessId)-and -not $keep.Contains([int]$r.ProcessId)){[void]$keep.Add([int]$r.ProcessId);$changed=$true}}} while($changed)',
            '$rows | Where-Object {$keep.Contains([int]$_.ProcessId)} | ConvertTo-Json -Compress'
        ].join(';');
        const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim();
        if (!raw) return [];
        const values = JSON.parse(raw);
        return (Array.isArray(values) ? values : [values]).map(row => ({
            pid: Number(row.ProcessId) || 0, ppid: Number(row.ParentProcessId) || 0,
            name: String(row.Name || ''), rssBytes: Number(row.WorkingSetSize) || 0,
            cpuTimeMs: (Number(row.KernelModeTime) + Number(row.UserModeTime)) / 10000,
            startedAt: String(row.CreationDate || '')
        }));
    } catch { return []; }
}

function posixSnapshot(rootPids) {
    try {
        const raw = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,time=,lstart=,comm='], { encoding: 'utf8' });
        const rows = raw.trim().split(/\r?\n/).map(line => {
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);
            return match ? { pid: Number(match[1]), ppid: Number(match[2]), rssBytes: Number(match[3]) * 1024,
                cpuTimeMs: cpuClockMs(match[4]), startedAt: match[5], name: match[6] } : null;
        }).filter(Boolean);
        const keep = new Set(rootPids);
        let changed = true;
        while (changed) { changed = false; for (const row of rows) if (keep.has(row.ppid) && !keep.has(row.pid)) { keep.add(row.pid); changed = true; } }
        return rows.filter(row => keep.has(row.pid));
    } catch { return []; }
}

function cpuClockMs(value) {
    const [dayText, clock] = String(value).includes('-') ? String(value).split('-') : ['0', String(value)];
    const parts = clock.split(':').map(Number);
    if (parts.some(value => !Number.isFinite(value)) || parts.length < 2 || parts.length > 3) return null;
    const seconds = parts.pop(), minutes = parts.pop(), hours = parts.pop() || 0;
    return (Number(dayText) * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
}

function cpuDelta(previous, processes, elapsedMs) {
    if (!previous || elapsedMs <= 0) return { cpuDeltaMs: null, cpuPercentOneCore: null, cpuMatchedProcesses: 0 };
    const old = new Map(previous.map(row => [`${row.pid}:${row.startedAt}`, row.cpuTimeMs]));
    let total = 0, matched = 0;
    for (const row of processes) {
        const baseline = old.get(`${row.pid}:${row.startedAt}`);
        if (Number.isFinite(baseline) && Number.isFinite(row.cpuTimeMs) && row.cpuTimeMs >= baseline) {
            total += row.cpuTimeMs - baseline; matched++;
        }
    }
    return { cpuDeltaMs: matched ? total : null, cpuPercentOneCore: matched ? total / elapsedMs * 100 : null,
        cpuMatchedProcesses: matched };
}

function createRuntimeSampler(options = {}) {
    const intervalMs = Math.max(1000, Number(options.intervalMs) || 5000);
    const maxSamples = Math.max(1, Number(options.maxSamples) || 220);
    const controllerRootPids = numberList(options.controllerRootPids);
    let backendPid = Number(options.backendPid) || portPid(Number(options.backendPort));
    let timer = null, label = '', samples = [], warnings = [], previous = null, previousAt = 0, sampleCount = 0;
    if (!backendPid && options.backendPort) warnings.push(`backend PID unavailable for port ${options.backendPort}`);

    const sample = () => {
        if (!backendPid && options.backendPort) backendPid = portPid(Number(options.backendPort));
        const roots = numberList([backendPid, ...controllerRootPids]);
        const processes = process.platform === 'win32' ? windowsSnapshot(roots) : posixSnapshot(roots);
        const now = Date.now(), elapsedMs = previousAt ? now - previousAt : 0;
        const rssBytes = processes.reduce((sum, row) => sum + (Number(row.rssBytes) || 0), 0);
        samples.push({ at: new Date().toISOString(), label, backendPid: backendPid || null,
            controllerRootPids, processCount: processes.length, rssBytes, elapsedMs,
            ...cpuDelta(previous, processes, elapsedMs), processes });
        previous = processes; previousAt = now; sampleCount++;
        if (samples.length > maxSamples) samples.shift();
    };

    return {
        snapshot() { return { backendPid: backendPid || null, controllerRootPids, intervalMs, sampleCount,
            retainedSampleCount: samples.length, cpuUnit: 'percent of one logical core; may exceed 100', samples, warnings }; },
        async start(nextLabel = 'runtime') {
            label = String(nextLabel || 'runtime'); sample();
            timer = setInterval(sample, intervalMs); timer.unref?.(); return this;
        },
        async stop() {
            if (timer) clearInterval(timer); timer = null; sample(); await sleep(0);
            return this.snapshot();
        }
    };
}

module.exports = { createRuntimeSampler, portPid, cpuClockMs, cpuDelta };

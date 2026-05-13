// --- Data Transfer Backup Mismatch Report UI ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.backupMismatchReportUiReady) return;
    if (!ns.BackupMismatchReportCore) {
        console.warn('[DataTransfer] Backup mismatch UI helpers missing; UI not initialized.');
        return;
    }

    const { text, escapeHtml } = ns.BackupMismatchReportCore;

    function getToast() {
        return typeof window.showToast === 'function'
            ? window.showToast
            : function (message) { console.log('[BackupMismatchReport]', message); };
    }

    function severityRank(value) {
        if (value === 'broken') return 0;
        if (value === 'warning') return 1;
        return 2;
    }

    function renderIssuePills(issues) {
        if (!Array.isArray(issues) || !issues.length) {
            return '<span class="backup-mismatch-pill healthy">No issues</span>';
        }
        return issues.slice(0, 5).map((issue) => (
            `<span class="backup-mismatch-pill ${escapeHtml(issue.severity)}" title="${escapeHtml(issue.detail || issue.code)}">${escapeHtml(issue.code)}</span>`
        )).join('');
    }

    function renderRecordRow(record) {
        const link = record.entityLink || record.fallbackLink || '';
        const detail = record.issues.map((issue) => issue.label + (issue.detail ? ` ${issue.detail}` : '')).join('\n');
        return `
            <article class="backup-mismatch-row ${escapeHtml(record.severity)}">
                <div class="backup-mismatch-row-head">
                    <span class="backup-mismatch-status">${escapeHtml(record.status)}</span>
                    <strong>${escapeHtml(record.displayName || record.entityId || record.path)}</strong>
                    <span>${escapeHtml(record.type || 'entity')}</span>
                </div>
                <div class="backup-mismatch-path">${escapeHtml(record.path)}</div>
                ${link ? `<code class="backup-mismatch-link">${escapeHtml(link)}</code>` : ''}
                <div class="backup-mismatch-issues" title="${escapeHtml(detail)}">${renderIssuePills(record.issues)}</div>
            </article>
        `;
    }

    function renderBackupMismatchReport(report, targetId = 'backupMismatchReportResults') {
        const target = document.getElementById(targetId);
        if (!target) return false;
        if (!report) {
            target.innerHTML = '<div class="backup-mismatch-empty">No backup mismatch report has been generated yet.</div>';
            return true;
        }

        const reportIssues = Array.isArray(report.issues) ? report.issues : [];
        const actionableRecords = (Array.isArray(report.records) ? report.records : [])
            .slice()
            .sort((a, b) => {
                const severityDelta = severityRank(a.severity) - severityRank(b.severity);
                return severityDelta || String(a.path || '').localeCompare(String(b.path || ''));
            });
        const visibleRecords = actionableRecords.filter((record) => record.severity !== 'healthy').slice(0, 120);
        const hiddenHealthy = Math.max(0, actionableRecords.length - visibleRecords.length);

        target.innerHTML = `
            <section class="backup-mismatch-report">
                <div class="backup-mismatch-summary">
                    <div><strong>${escapeHtml(report.counts.broken)}</strong><span>Broken</span></div>
                    <div><strong>${escapeHtml(report.counts.warning)}</strong><span>Review</span></div>
                    <div><strong>${escapeHtml(report.counts.recoverable)}</strong><span>Recoverable</span></div>
                    <div><strong>${escapeHtml(report.counts.healthy)}</strong><span>Healthy</span></div>
                </div>
                <div class="backup-mismatch-counts">
                    <span>${escapeHtml(report.counts.workspace)} tabs</span>
                    <span>${escapeHtml(report.counts.card)} cards</span>
                    <span>${escapeHtml(report.counts.folder)} folders</span>
                    <span>${escapeHtml(report.counts.bookmark)} bookmarks</span>
                    <span>${escapeHtml(report.scannedFiles)} JSON files scanned</span>
                </div>
                ${reportIssues.length ? `
                    <div class="backup-mismatch-report-issues">
                        ${reportIssues.map((issue) => `<div class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.detail)}</span></div>`).join('')}
                    </div>
                ` : ''}
                <div class="backup-mismatch-list">
                    ${visibleRecords.length
                        ? visibleRecords.map(renderRecordRow).join('')
                        : '<div class="backup-mismatch-empty">No broken or review-needed backup entities found.</div>'}
                </div>
                ${hiddenHealthy ? `<div class="backup-mismatch-footer">${escapeHtml(hiddenHealthy)} healthy or lower-priority rows hidden from the compact report.</div>` : ''}
            </section>
        `;
        return true;
    }

    async function runBackupMismatchReportBrowserOnly() {
        const toast = getToast();
        const target = document.getElementById('backupMismatchReportResults');
        if (typeof window.showDirectoryPicker !== 'function') {
            toast('Backup mismatch report needs browser folder picker support.', 'error');
            return null;
        }
        if (target) target.innerHTML = '<div class="backup-mismatch-empty">Scanning backup folder and validating entity links...</div>';
        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            const report = await ns.buildBackupMismatchReportFromFolder(rootHandle, { rootName: rootHandle.name });
            report.rootName = text(rootHandle.name, report.rootName);
            ns.lastBackupMismatchReport = report;
            renderBackupMismatchReport(report);
            const tone = report.counts.broken > 0 ? 'warning' : 'success';
            toast(`Backup mismatch report complete: ${report.counts.broken} broken, ${report.counts.warning} review-needed.`, tone);
            return report;
        } catch (error) {
            if (error?.name === 'AbortError') {
                toast('Backup mismatch scan canceled.', 'info');
                if (target) renderBackupMismatchReport(null);
                return null;
            }
            console.error('[DataTransfer] Backup mismatch report failed:', error);
            toast(`Backup mismatch report failed: ${error.message || error}`, 'error');
            if (target) target.innerHTML = `<div class="backup-mismatch-empty broken">${escapeHtml(error.message || error)}</div>`;
            return null;
        }
    }

    function clearBackupMismatchReport() {
        ns.lastBackupMismatchReport = null;
        renderBackupMismatchReport(null);
    }

    function downloadBackupMismatchReportJson() {
        const report = ns.lastBackupMismatchReport;
        const toast = getToast();
        if (!report) {
            toast('Run a backup mismatch report first.', 'info');
            return false;
        }
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `eve_backup_mismatch_report_${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        return true;
    }

    Object.assign(ns, {
        renderBackupMismatchReport,
        runBackupMismatchReportBrowserOnly,
        clearBackupMismatchReport,
        downloadBackupMismatchReportJson
    });

    window.runBackupMismatchReportBrowserOnly = runBackupMismatchReportBrowserOnly;
    window.clearBackupMismatchReport = clearBackupMismatchReport;
    window.downloadBackupMismatchReportJson = downloadBackupMismatchReportJson;

    ns.backupMismatchReportReady = true;
    ns.backupMismatchReportUiReady = true;
})();

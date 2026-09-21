#!/usr/bin/env node
import http from 'node:http';
import {
  PORTS,
  WEB_BASE,
  controlHealth,
  directIdentity,
  runtimeSnapshot,
  serviceStatus,
  waitForTloReady,
  writeSnapshot,
} from '../runtime/search-monitor-runtime.shared.mjs';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

const MODEL_TIMEOUT_MS = positiveInt(process.env.EVEOS_LIVE_MODEL_TIMEOUT_MS, 10 * 60_000);
const GENERATION_TIMEOUT_MS = positiveInt(process.env.EVEOS_LIVE_GENERATION_TIMEOUT_MS, 5 * 60_000);
const INCLUDE_GEMINI = String(process.env.EVEOS_RUNTIME_INCLUDE_GEMINI || '') === '1';

function streamTloGeneration() {
  return new Promise((resolve, reject) => {
    const requestId = `runtime-${Date.now().toString(36)}-${process.pid}`;
    const prompt = 'Reply with exactly EVEOS_RUNTIME_OK and nothing else.';
    const encoded = Buffer.from(JSON.stringify({
      requestId,
      scopeId: 'default',
      message: prompt,
      history: [],
    }));
    const target = new URL(`${WEB_BASE}/api/eve-state/modular/tlo/chat/stream`);
    const startedAt = Date.now();
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        Connection: 'close',
        'Content-Type': 'application/json',
        'Content-Length': String(encoded.length),
      },
    }, (response) => {
      if (Number(response.statusCode || 0) !== 200) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          reject(new Error(`TLO generation returned HTTP ${response.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 1000)}`));
        });
        return;
      }

      let buffer = '';
      let generated = '';
      let doneSeen = false;
      let usage = null;
      response.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trimStart();
          if (raw === '[DONE]') {
            doneSeen = true;
            continue;
          }
          let payload;
          try { payload = JSON.parse(raw); } catch (_) { continue; }
          if (payload?.error) {
            reject(new Error(`TLO generation error: ${payload.error.message || JSON.stringify(payload.error)}`));
            request.destroy();
            return;
          }
          const piece = payload?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string') generated += piece;
          if (payload?.usage) usage = payload.usage;
        }
      });
      response.on('end', () => {
        if (!doneSeen) {
          reject(new Error('TLO generation stream ended without [DONE].'));
          return;
        }
        const text = generated.trim();
        if (!text) {
          reject(new Error('TLO generation completed without visible model output.'));
          return;
        }
        resolve({
          requestId,
          prompt,
          text,
          chars: text.length,
          markerMatched: text.includes('EVEOS_RUNTIME_OK'),
          usage,
          durationMs: Date.now() - startedAt,
        });
      });
    });
    request.setTimeout(GENERATION_TIMEOUT_MS, () => {
      request.destroy(new Error(`TLO generation timed out after ${Math.round(GENERATION_TIMEOUT_MS / 1000)}s`));
    });
    request.on('error', reject);
    request.write(encoded);
    request.end();
  });
}

async function requireLiveService(name) {
  const status = await serviceStatus(name);
  const identity = await directIdentity(name);
  requireCondition(status?.running === true, `${name} is not running: ${status?.state || 'unavailable'} ${status?.message || ''}`);
  requireCondition(identity.ready === true, `${name} failed direct identity verification`);
  return { status, identity: identity.payload };
}

async function main() {
  const control = await controlHealth();
  requireCondition(control?.service === 'eveos-control-plane', 'EveOS Local Control is not running or branded correctly.');

  const web = await requireLiveService('web');
  const localMoe = await requireLiveService('localMoe');
  const nexusBrowser = await requireLiveService('nexusBrowser');
  let gemini = null;
  if (INCLUDE_GEMINI) gemini = await requireLiveService('gemini');

  requireCondition(localMoe.status.port === PORTS.LOCAL_MOE_HARNESS_PORT, 'Local MoE Harness port drifted from registry.');
  requireCondition(localMoe.status.runtimePort === PORTS.FREETOKEN_PORT, 'FreeToken runtime port drifted from registry.');
  requireCondition(nexusBrowser.status.port === PORTS.NEXUS_BROWSER_PORT, 'Nexus Browser port drifted from registry.');

  console.log(`WAIT LIVE MODEL up to ${Math.round(MODEL_TIMEOUT_MS / 1000)}s`);
  const tlo = await waitForTloReady(MODEL_TIMEOUT_MS);
  requireCondition(tlo.localMoe?.runtimeReady === true, 'TLO says chat-ready without a ready Local MoE runtime.');
  requireCondition(!!tlo.agent?.activeModelId, 'TLO is ready but did not report an active model.');

  console.log(`GENERATE ${tlo.agent.activeModelId}`);
  const generation = await streamTloGeneration();
  requireCondition(generation.chars > 0, 'Local model produced no text.');

  const snapshot = await runtimeSnapshot({
    liveRuntimeSmoke: {
      ok: true,
      includeGemini: INCLUDE_GEMINI,
      services: {
        web: { state: web.status.state, port: web.status.port },
        localMoe: {
          state: localMoe.status.state,
          port: localMoe.status.port,
          runtimePort: localMoe.status.runtimePort,
          runtimeReady: localMoe.status.runtimeReady,
          activeModel: localMoe.status.activeModel,
        },
        nexusBrowser: {
          state: nexusBrowser.status.state,
          port: nexusBrowser.status.port,
          extensionConnected: nexusBrowser.status.extensionConnected,
          onlineTargets: nexusBrowser.status.onlineTargets,
          localTargets: nexusBrowser.status.localTargets,
        },
        gemini: gemini ? { state: gemini.status.state, running: gemini.status.running } : null,
      },
      generation: {
        requestId: generation.requestId,
        chars: generation.chars,
        markerMatched: generation.markerMatched,
        durationMs: generation.durationMs,
        preview: generation.text.slice(0, 240),
        usage: generation.usage,
      },
    },
  });
  const artifact = writeSnapshot(snapshot, 'search-monitor-live-runtime');

  console.log('SEARCH_MONITOR_LIVE_RUNTIME_SMOKE_OK ' + JSON.stringify({
    model: tlo.agent.activeModelId,
    generatedChars: generation.chars,
    markerMatched: generation.markerMatched,
    durationMs: generation.durationMs,
    nexusExtensionConnected: nexusBrowser.status.extensionConnected === true,
    nexusOnlineTargets: Number(nexusBrowser.status.onlineTargets || 0),
    snapshot: artifact.json,
  }));
}

main().catch(async (error) => {
  console.error(error?.stack || error?.message || String(error));
  try {
    const snapshot = await runtimeSnapshot({ liveRuntimeSmoke: { ok: false, error: String(error?.message || error) } });
    const artifact = writeSnapshot(snapshot, 'search-monitor-live-runtime-failure');
    console.error(`[RUNTIME_DIAGNOSTIC] ${artifact.json}`);
  } catch (_) {}
  process.exitCode = 1;
});

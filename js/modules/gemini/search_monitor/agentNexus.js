/* Agent Nexus: peer surfaces and local Agent Management UI. */
(function () {
    'use strict';

    if (window.EveOSAgentNexus) return;

    const API_PATH = '/api/eve-state/modular/agent-management';
    const boundRoots = new WeakSet();
    let root = null;
    let store = null;
    let selectedAgentId = 'tlo';
    let busy = false;
    const draftAgentIds = new Set();

    function markup() {
        return `
            <div class="eveos-agent-nexus-intro">
                <strong>Two peers, separate responsibilities</strong>
                <span>TLO is a Local MoE-backed agent. Nexus Browser is the headed browser transport graduating from Browser AI Bridge.</span>
            </div>
            <div class="eveos-agent-nexus-nav" role="tablist" aria-label="Agent Nexus surfaces">
                <button type="button" class="is-active" data-agent-nexus-view="tlo" role="tab" aria-selected="true">TLO</button>
                <button type="button" data-agent-nexus-view="nexus-browser" role="tab" aria-selected="false">Nexus Browser</button>
                <button type="button" data-agent-nexus-view="management" role="tab" aria-selected="false">Agent Management</button>
            </div>
            <section class="eveos-agent-nexus-panel" data-agent-nexus-panel="tlo">
                <article class="eveos-agent-card" data-agent-id="tlo">
                    <span class="eveos-agent-avatar">T</span>
                    <span><strong>TLO</strong><small>Local agent identity above the generic Local MoE provider.</small></span>
                    <span class="eveos-ai-provider-pill">Foundation</span>
                </article>
                <p class="eveos-ai-provider-message">Opening TLO never starts Local MoE or a model. Chat transport will be wired after the local identity contract is proven.</p>
                <button type="button" class="eveos-agent-nexus-secondary" data-agent-nexus-view="management">Open Agent Management</button>
            </section>
            <section class="eveos-agent-nexus-panel" data-agent-nexus-panel="nexus-browser" hidden>
                <article class="eveos-agent-card" data-agent-tool-id="nexus-browser">
                    <span class="eveos-agent-avatar eveos-agent-avatar--browser">N</span>
                    <span><strong>Nexus Browser</strong><small>Headed browser AI targeting, routing, and response capture.</small></span>
                    <span class="eveos-ai-provider-pill">Migration staged</span>
                </article>
                <div class="eveos-agent-nexus-facts">
                    <span><small>Default transport</small><strong>Headed / observable</strong></span>
                    <span><small>Headless</small><strong>Unavailable until proven</strong></span>
                    <span><small>Runtime</small><strong>Not imported yet</strong></span>
                </div>
                <p class="eveos-ai-provider-message">The private POC remains the reference source while its public core and exact-once contracts are migrated by responsibility.</p>
            </section>
            <section class="eveos-agent-nexus-panel" data-agent-nexus-panel="management" hidden>
                <div class="eveos-agent-management-head">
                    <span><strong>Agent Management</strong><small>Private profiles persist only on this machine.</small></span>
                    <button type="button" data-agent-management-action="new">New agent</button>
                </div>
                <p class="eveos-agent-management-status" data-agent-management-status>Open this view to load local agent profiles.</p>
                <div class="eveos-agent-tabs" data-agent-management-tabs role="tablist" aria-label="Local agents"></div>
                <form class="eveos-agent-form" data-agent-management-form hidden>
                    <label>Agent ID<input name="id" maxlength="64" pattern="[a-z0-9][a-z0-9._-]{0,63}" required></label>
                    <label>Display name<input name="displayName" maxlength="100" required></label>
                    <label class="is-wide">Role<input name="role" maxlength="240"></label>
                    <label class="is-wide">Identity<textarea name="identity" rows="4" maxlength="16000"></textarea></label>
                    <label>Provider<select name="provider"><option value="local-moe">Local MoE</option><option value="unassigned">Unassigned</option></select></label>
                    <label>Model ID<input name="modelId" maxlength="160" placeholder="Use Harness selection"></label>
                    <label class="is-wide">Working rules <small>One per line</small><textarea name="workingRules" rows="4"></textarea></label>
                    <label class="is-wide">Allowed tools <small>One per line</small><textarea name="allowedTools" rows="3"></textarea></label>
                    <label class="is-wide">Default scope instructions<textarea name="scopeInstructions" rows="4"></textarea></label>
                    <label class="is-wide">Private notes <small>Never included in browser projections</small><textarea name="privateNotes" rows="3"></textarea></label>
                    <div class="eveos-agent-form-actions is-wide">
                        <button type="submit" data-agent-management-action="save">Save locally</button>
                        <span>Schema v1 · atomic local persistence</span>
                    </div>
                </form>
            </section>
        `;
    }

    function setStatus(message, state) {
        const node = root?.querySelector('[data-agent-management-status]');
        if (!node) return;
        node.textContent = message;
        node.dataset.state = state || 'idle';
    }

    function candidateBases() {
        const networkBases = window.GeminiServerNetwork?.localCandidateBases?.() || [];
        const registryBase = window.EveOSPortRegistry?.url?.('EVEOS_WEB_PORT');
        const current = /^https?:$/.test(window.location?.protocol || '') ? window.location.origin : '';
        return Array.from(new Set([current, registryBase, 'http://127.0.0.1:8765', ...networkBases].filter(Boolean)));
    }

    async function request(path, options) {
        let lastError = null;
        for (const base of candidateBases()) {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch(`${base}${path}`, {
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    ...options,
                    signal: controller.signal
                });
                const payload = await response.json().catch(() => ({}));
                if (response.status === 404) {
                    lastError = new Error('Agent Management endpoint not found.');
                    continue;
                }
                if (!response.ok || payload.ok !== true) {
                    throw new Error(payload.error || `Agent Management request failed (${response.status}).`);
                }
                return payload;
            } catch (error) {
                lastError = error;
                if (!/fetch|network|abort|not found/i.test(String(error?.message || ''))) throw error;
            } finally {
                window.clearTimeout(timer);
            }
        }
        throw lastError || new Error('EveOS localhost is unavailable.');
    }

    function splitLines(value) {
        return String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    }

    function selectedAgent() {
        return store?.agents?.find((agent) => agent.id === selectedAgentId) || null;
    }

    function renderTabs() {
        const host = root?.querySelector('[data-agent-management-tabs]');
        if (!host) return;
        host.replaceChildren();
        for (const agent of store?.agents || []) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.agentManagementAgent = agent.id;
            button.textContent = agent.displayName;
            button.classList.toggle('is-active', agent.id === selectedAgentId);
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(agent.id === selectedAgentId));
            host.appendChild(button);
        }
    }

    function writeField(form, name, value) {
        const field = form?.elements?.namedItem(name);
        if (field) field.value = value || '';
    }

    function renderForm() {
        const form = root?.querySelector('[data-agent-management-form]');
        const agent = selectedAgent();
        if (!form || !agent) return;
        const scope = agent.scopes?.find((item) => item.id === 'default') || agent.scopes?.[0] || {};
        form.hidden = false;
        writeField(form, 'id', agent.id);
        form.elements.namedItem('id').readOnly = !draftAgentIds.has(agent.id);
        writeField(form, 'displayName', agent.displayName);
        writeField(form, 'role', agent.role);
        writeField(form, 'identity', agent.identity);
        writeField(form, 'provider', agent.providerBinding?.provider || 'unassigned');
        writeField(form, 'modelId', agent.providerBinding?.modelId);
        writeField(form, 'workingRules', (agent.workingRules || []).join('\n'));
        writeField(form, 'allowedTools', (agent.allowedTools || []).join('\n'));
        writeField(form, 'scopeInstructions', scope.instructions);
        writeField(form, 'privateNotes', (agent.privateNotes || []).join('\n'));
    }

    function renderManagement() {
        renderTabs();
        renderForm();
    }

    async function loadManagement(force) {
        if ((store && !force) || busy) return;
        busy = true;
        setStatus('Loading private local profiles…', 'busy');
        try {
            const payload = await request(API_PATH);
            store = payload.store;
            if (!store.agents.some((agent) => agent.id === selectedAgentId)) {
                selectedAgentId = store.agents[0]?.id || '';
            }
            renderManagement();
            setStatus(payload.persisted
                ? `${store.agents.length} local agent profile${store.agents.length === 1 ? '' : 's'} loaded.`
                : 'Using the safe TLO template. Save to create the local Agent Management store.', 'ok');
        } catch (error) {
            setStatus(error?.message || 'Agent Management is unavailable.', 'error');
        } finally {
            busy = false;
        }
    }

    function createDraft() {
        if (!store) store = { schema: 'eveos.agent-management', schemaVersion: 1, agents: [] };
        let suffix = store.agents.length + 1;
        while (store.agents.some((agent) => agent.id === `agent-${suffix}`)) suffix += 1;
        const agent = {
            id: `agent-${suffix}`,
            displayName: `Agent ${suffix}`,
            role: '', identity: '', workingRules: [], allowedTools: [], permissions: [], privateNotes: [],
            providerBinding: { provider: 'unassigned', modelId: '', profile: '' },
            scopes: [{ id: 'default', label: 'Default', instructions: '', context: [], allowedTools: [] }]
        };
        store.agents.push(agent);
        draftAgentIds.add(agent.id);
        selectedAgentId = agent.id;
        renderManagement();
        setStatus('New local draft. Choose a stable ID before saving.', 'idle');
    }

    function agentFromForm(form) {
        const existing = selectedAgent() || {};
        const data = new FormData(form);
        const scope = existing.scopes?.find((item) => item.id === 'default') || {
            id: 'default', label: 'Default', context: [], allowedTools: []
        };
        return {
            ...existing,
            id: String(data.get('id') || '').trim().toLowerCase(),
            displayName: String(data.get('displayName') || '').trim(),
            role: String(data.get('role') || '').trim(),
            identity: String(data.get('identity') || '').trim(),
            workingRules: splitLines(data.get('workingRules')),
            allowedTools: splitLines(data.get('allowedTools')),
            privateNotes: splitLines(data.get('privateNotes')),
            providerBinding: {
                provider: String(data.get('provider') || 'unassigned'),
                modelId: String(data.get('modelId') || '').trim(),
                profile: existing.providerBinding?.profile || ''
            },
            scopes: [{ ...scope, instructions: String(data.get('scopeInstructions') || '').trim() }]
        };
    }

    async function saveCurrent(form) {
        if (busy) return;
        busy = true;
        setStatus('Saving locally…', 'busy');
        try {
            const oldId = selectedAgentId;
            const payload = await request(`${API_PATH}/save`, {
                method: 'POST',
                body: JSON.stringify({ agent: agentFromForm(form) })
            });
            const index = store.agents.findIndex((agent) => agent.id === oldId);
            if (index >= 0) store.agents[index] = payload.agent;
            else store.agents.push(payload.agent);
            selectedAgentId = payload.agent.id;
            draftAgentIds.delete(oldId);
            renderManagement();
            setStatus(`${payload.agent.displayName} saved to the private local store.`, 'ok');
        } catch (error) {
            setStatus(error?.message || 'Agent profile could not be saved.', 'error');
        } finally {
            busy = false;
        }
    }

    function selectView(view) {
        root?.querySelectorAll('[data-agent-nexus-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.agentNexusPanel !== view;
        });
        root?.querySelectorAll('[data-agent-nexus-view]').forEach((button) => {
            const active = button.dataset.agentNexusView === view;
            button.classList.toggle('is-active', active);
            if (button.getAttribute('role') === 'tab') button.setAttribute('aria-selected', String(active));
        });
        if (view === 'management') loadManagement(false);
    }

    function handleClick(event) {
        const viewButton = event.target.closest('[data-agent-nexus-view]');
        if (viewButton) {
            event.preventDefault();
            selectView(viewButton.dataset.agentNexusView);
            return;
        }
        const agentButton = event.target.closest('[data-agent-management-agent]');
        if (agentButton) {
            selectedAgentId = agentButton.dataset.agentManagementAgent;
            renderManagement();
            return;
        }
        const action = event.target.closest('[data-agent-management-action]')?.dataset.agentManagementAction;
        if (action === 'new') createDraft();
    }

    function bind(container) {
        root = container;
        if (boundRoots.has(container)) return;
        boundRoots.add(container);
        container.addEventListener('click', handleClick);
        container.addEventListener('submit', (event) => {
            if (!event.target.matches('[data-agent-management-form]')) return;
            event.preventDefault();
            saveCurrent(event.target);
        });
    }

    window.EveOSAgentNexus = Object.freeze({ markup, bind, loadManagement });
})();

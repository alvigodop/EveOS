/**
 * Debug Panel UI Module
 * Handles creating the DOM elements for the debug panel.
 */
(function () {
    const DPPanel = {
        name: 'DPPanel',
        version: '1.0.0',
        _initialized: false,

        init: function () {
            console.log('DPPanel initialized');
            this._initialized = true;
            return true;
        },

        createFullDebugPanel: function (context) {
            try {
                const errorPanel = document.createElement('div');
                errorPanel.id = 'errorDebugPanel';
                errorPanel.className = 'error-debug-panel';
                Object.assign(errorPanel.style, {
                    position: 'fixed',
                    top: '10%',
                    left: '10%',
                    width: '80%',
                    height: '80%',
                    backgroundColor: '#2c2c2c',
                    color: '#e0e0e0',
                    border: '1px solid #666',
                    borderRadius: '5px',
                    padding: '20px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                    zIndex: '10000',
                    overflowY: 'auto'
                });

                // Close button
                const closeBtn = this.createButton('×', () => errorPanel.style.display = 'none', {
                    position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none',
                    color: '#e0e0e0', fontSize: '24px'
                });
                errorPanel.appendChild(closeBtn);

                // Header
                const header = document.createElement('h2');
                header.textContent = 'Debug Panel';
                errorPanel.appendChild(header);

                // Simple content
                const simpleContent = document.createElement('div');
                simpleContent.innerHTML = '<p>Debug panel initialized.</p>';
                errorPanel.appendChild(simpleContent);

                // Buttons
                const btnContainer = document.createElement('div');
                btnContainer.style.margin = '10px 0';

                const diagBtn = this.createButton('Run Diagnostics', () => this.runDiagnostics(simpleContent, context), { backgroundColor: '#4caf50' }, 'debug-btn');
                const clearBtn = this.createButton('Clear Console', () => this.clearConsole(context), { backgroundColor: '#f44336' }, 'debug-btn');
                const statusBtn = this.createButton('Module Status', () => this.showModuleStatus(), { backgroundColor: '#2196f3' }, 'debug-btn');

                btnContainer.appendChild(diagBtn);
                btnContainer.appendChild(clearBtn);
                btnContainer.appendChild(statusBtn);
                errorPanel.appendChild(btnContainer);

                // Log Container
                const logContainer = document.createElement('div');
                logContainer.id = 'debugLogContainer';
                Object.assign(logContainer.style, {
                    backgroundColor: '#1c1c1c',
                    padding: '10px',
                    fontFamily: 'monospace',
                    height: 'calc(100% - 150px)',
                    overflowY: 'auto',
                    border: '1px solid #444'
                });
                errorPanel.appendChild(logContainer);

                document.body.appendChild(errorPanel);
                errorPanel.style.display = 'block';

                return errorPanel;
            } catch (e) {
                console.error("Critical error creating debug panel:", e);
                alert("Failed to create debug panel: " + e.message);
                return null;
            }
        },

        createEmergencyDebugPanel: function () {
            console.log("Creating emergency debug panel");
            let errorPanel = document.getElementById('emergencyDebugPanel');

            if (!errorPanel) {
                errorPanel = document.createElement('div');
                errorPanel.id = 'emergencyDebugPanel';
                Object.assign(errorPanel.style, {
                    position: 'fixed', top: '10%', left: '10%', width: '80%', height: '80%',
                    backgroundColor: '#2c2c2c', color: '#e0e0e0', border: '1px solid #666', padding: '20px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.5)', zIndex: '10000', overflowY: 'auto'
                });

                const closeBtn = this.createButton('×', () => errorPanel.style.display = 'none', {
                    position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none',
                    color: '#e0e0e0', fontSize: '24px'
                });
                errorPanel.appendChild(closeBtn);

                const header = document.createElement('h2');
                header.textContent = 'Emergency Debug Panel';
                errorPanel.appendChild(header);

                const content = document.createElement('div');
                content.innerHTML = '<p>The regular debug panel failed to load. This is an emergency fallback panel.</p>';
                this.appendEmergencyContent(content);
                errorPanel.appendChild(content);

                document.body.appendChild(errorPanel);
            }
            errorPanel.style.display = 'block';
            return errorPanel;
        },

        createButton: function (text, onClick, styles = {}, className = '') {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.onclick = onClick;
            if (className) btn.className = className;

            // Default styles
            Object.assign(btn.style, {
                padding: '8px 16px', margin: '5px', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white'
            });
            // Override/Add styles
            Object.assign(btn.style, styles);
            return btn;
        },

        runDiagnostics: function (outputContainer, context) {
            try {
                if (window.DebugDiagnostics) {
                    DebugDiagnostics.diagnoseCriticalIssues();
                } else if (typeof window.diagnoseCriticalIssues === 'function') {
                    window.diagnoseCriticalIssues();
                } else {
                    alert("Diagnostics module missing");
                }
                if (context && context.refreshErrorLog) context.refreshErrorLog();
            } catch (e) {
                console.error("Error running diagnostics:", e);
                outputContainer.innerHTML += `<p style="color:red">Error: ${e.message}</p>`;
            }
        },

        clearConsole: function (context) {
            console.clear();
            if (context && context.refreshErrorLog) context.refreshErrorLog();
        },

        showModuleStatus: function () {
            try {
                if (typeof window.showDirectModuleStatus === 'function') {
                    window.showDirectModuleStatus();
                } else if (window.UIModuleStatus && typeof UIModuleStatus.showModuleStatus === 'function') {
                    UIModuleStatus.showModuleStatus({ view: 'full' });
                } else if (window.ModuleStatus && typeof ModuleStatus.showStatus === 'function') {
                    ModuleStatus.showStatus({ view: 'full' });
                } else {
                    alert('Module status function not available');
                }
            } catch (e) {
                alert('Error showing module status: ' + e.message);
            }
        },

        appendEmergencyContent: function (container) {
            // Loaded Scripts
            const scripts = document.querySelectorAll('script');
            const scriptList = document.createElement('ul');
            scripts.forEach(script => {
                if (script.src) {
                    const item = document.createElement('li');
                    item.textContent = script.src.split('/').pop();
                    scriptList.appendChild(item);
                }
            });
            container.appendChild(document.createElement('h3')).textContent = 'Loaded Scripts:';
            container.appendChild(scriptList);

            // Global Objects
            const globals = ['ModuleRegistry', 'DebugPanel', 'TabManager', 'EventManager', 'SearchManager'];
            const globalsList = document.createElement('ul');
            globals.forEach(name => {
                const item = document.createElement('li');
                item.textContent = name + ': ' + (window[name] ? 'Available' : 'Not Available');
                globalsList.appendChild(item);
            });
            container.appendChild(document.createElement('h3')).textContent = 'Global Objects:';
            container.appendChild(globalsList);
        }
    };

    window.DPPanel = DPPanel;
})();

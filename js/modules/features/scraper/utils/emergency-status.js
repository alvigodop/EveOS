/**
 * Emergency Status Module
 * 
 * COMPLETELY STANDALONE module status display - absolutely no dependencies.
 * Extracted from ScraperTest.html
 */

function showDirectModuleStatus() {
    console.log('[EMERGENCY] Direct module status display triggered');

    try {
        // Remove any existing popups to avoid duplicates
        document.querySelectorAll('.module-status-popup, #moduleStatusPopup, #directModuleStatusPopup, .popup').forEach(popup => {
            try {
                popup.style.display = 'none';
                if (popup.parentNode) popup.parentNode.removeChild(popup);
            } catch (e) {
                console.error('Error removing popup:', e);
            }
        });

        // Create popup container
        const popup = document.createElement('div');
        popup.id = 'emergencyModuleStatusPopup';
        // Styles loaded from failsafe.css

        // Get all global objects that might be modules
        const possibleModules = [];
        for (const prop in window) {
            try {
                if (typeof window[prop] === 'object' && window[prop] !== null) {
                    const obj = window[prop];

                    // Check if it looks like a module
                    const isModule = (
                        typeof obj.init === 'function' ||
                        obj._initialized !== undefined ||
                        obj.name !== undefined ||
                        prop.endsWith('Manager') ||
                        prop.endsWith('Helper') ||
                        prop.includes('Module')
                    );

                    if (isModule &&
                        prop !== 'window' &&
                        prop !== 'document' &&
                        prop !== 'location' &&
                        prop !== 'localStorage' &&
                        prop !== 'sessionStorage' &&
                        prop !== 'console' &&
                        !prop.startsWith('webkit')
                    ) {
                        possibleModules.push({
                            name: prop,
                            initialized: !!obj._initialized,
                            hasInit: typeof obj.init === 'function',
                            registryName: obj.registryName || obj.name || ''
                        });
                    }
                }
            } catch (e) {
                // Ignore SecurityErrors (cross-origin frame access) to avoid red console spam
                if (e.name === 'SecurityError' || e.message.includes('cross-origin')) {
                    console.warn(`Skipped cross-origin property ${prop}`);
                } else {
                    console.warn(`Warning checking module ${prop}:`, e);
                }
            }
        }

        // Sort alphabetically
        possibleModules.sort((a, b) => a.name.localeCompare(b.name));

        // Create popup HTML
        let headerHTML = `
            <div class="emergency-header">
                <h3>Emergency Module Status</h3>
                <button id="closeEmergencyPopupBtn" class="emergency-close-btn">&times;</button>
            </div>
        `;

        let bodyHTML = `
            <div class="emergency-body">
                <div class="emergency-info-box">
                    <p>
                        <strong>Emergency View</strong>: Using completely standalone module detection
                    </p>
                </div>
                
                <div class="emergency-stats-box">
                    <strong>Detected Modules:</strong> ${possibleModules.length}<br>
                    <strong>Script Tags:</strong> ${document.querySelectorAll('script').length}<br>
                    <strong>UIModuleStatus Available:</strong> ${window.UIModuleStatus ? 'Yes' : 'No'}
                </div>
                
                <table class="emergency-table">
                    <thead>
                        <tr>
                            <th>Module Name</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Add module rows
        possibleModules.forEach(module => {
            bodyHTML += `
                <tr>
                    <td class="module-name">${module.name}</td>
                    <td>
                        <span class="emergency-status-available">✓ Available</span>
                        ${module.hasInit ?
                    '<span class="emergency-status-has-init">(Has Init)</span>' :
                    ''}
                        ${module.initialized ?
                    '<span class="emergency-status-initialized">(Initialized)</span>' :
                    module.hasInit ? '<span class="emergency-status-not-initialized">(Not Initialized)</span>' : ''}
                    </td>
                </tr>
            `;
        });

        bodyHTML += `
                    </tbody>
                </table>
            </div>
        `;

        // Set popup content
        popup.innerHTML = headerHTML + bodyHTML;

        // Add popup to body
        document.body.appendChild(popup);

        // Add close button event
        const closeBtn = document.getElementById('closeEmergencyPopupBtn');
        if (closeBtn) {
            closeBtn.onclick = function () {
                popup.style.display = 'none';
                if (popup.parentNode) {
                    popup.parentNode.removeChild(popup);
                }
            };
        }

        // Double check popup is visible (important for reliability)
        setTimeout(function () {
            if (popup && popup.style) {
                popup.style.display = 'block';
            }
        }, 100);

    } catch (err) {
        console.error('Failed to create emergency module status popup:', err);
        alert('Error creating module status display. Check console for details.');
    }

    return false; // Prevent default button action
}

// Attach to window just in case
window.showDirectModuleStatus = showDirectModuleStatus;

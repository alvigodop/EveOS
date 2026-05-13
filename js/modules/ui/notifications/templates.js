window.Notifications = window.Notifications || {};

window.Notifications.template = `
<div id="toast-container" style="position:fixed; bottom:20px; right:20px; display:flex; flex-direction:column; gap:10px; z-index:10000; pointer-events:none;"></div>

<div id="custom-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10001; justify-content:center; align-items:center;">
    <div id="custom-modal-card" style="background:var(--modal-bg); color:var(--modal-text); padding:20px; border-radius:12px; min-width:300px; max-width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:1px solid var(--modal-border);">
        <h3 id="custom-modal-title" style="margin-top:0;">Confirmation</h3>
        <p id="custom-modal-msg" style="margin-bottom:20px; color:var(--text-muted);"></p>
        <div id="custom-modal-input-container" style="display:none; margin-bottom:20px;">
            <input type="text" id="custom-modal-input" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--modal-border); background:var(--input-bg); color:var(--text-main);">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button id="custom-modal-cancel" class="btn-sec">Cancel</button>
            <button id="custom-modal-confirm" class="btn-primary">Confirm</button>
        </div>
    </div>
</div>
`;

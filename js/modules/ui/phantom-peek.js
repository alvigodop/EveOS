// --- PHANTOM PEEK OVERLAY ---
(function() {
    let peekOverlay = null;
    let hoverTimer = null;

    function initPhantomPeek() {
        if (peekOverlay) return;
        peekOverlay = document.createElement('div');
        peekOverlay.id = 'phantom-peek-overlay';
        peekOverlay.style.cssText = `
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--modal-border, rgba(255, 255, 255, 0.12));
            border-radius: 12px;
            padding: 12px;
            width: 300px;
            color: var(--text-main);
            font-family: sans-serif;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: none;
            flex-direction: column;
            gap: 8px;
        `;
        document.body.appendChild(peekOverlay);

        document.addEventListener('mouseover', handleMouseOver);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseout', handleMouseOut);
    }

    function showPeek(x, y, data) {
        if (!data || (!data.ogImage && !data.ogDesc && !data.liveTitle)) return;

        peekOverlay.innerHTML = '';
        peekOverlay.style.display = 'flex';

        if (data.ogImage) {
            const imgDiv = document.createElement('div');
            imgDiv.style.cssText = "width:100%; height:120px; border-radius:6px; background-size:cover; background-position:center; margin-bottom:8px;";
            if (typeof window.isRenderableImageUrl !== 'function' || window.isRenderableImageUrl(data.ogImage)) {
                imgDiv.style.backgroundImage = `url('${String(data.ogImage).replace(/'/g, "%27").replace(/"/g, "%22")}')`;
                peekOverlay.appendChild(imgDiv);
            }
        }
        if (data.liveTitle) {
            const titleDiv = document.createElement('div');
            titleDiv.style.cssText = "font-weight:600; font-size:0.95rem; line-height:1.2; margin-bottom:4px;";
            titleDiv.textContent = data.liveTitle;
            peekOverlay.appendChild(titleDiv);
        }
        if (data.ogDesc) {
            const descDiv = document.createElement('div');
            descDiv.style.cssText = "font-size:0.8rem; opacity:0.8; line-height:1.3; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;";
            descDiv.textContent = data.ogDesc;
            peekOverlay.appendChild(descDiv);
        }

        let statusColor = '#0f0';
        if (data.status === 'dead') statusColor = '#f00';
        if (data.status === 'redirected') statusColor = '#fa0';

        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = "margin-top:6px; font-size:0.75rem; display:flex; align-items:center; gap:6px;";

        const dotSpan = document.createElement('span');
        dotSpan.style.cssText = `display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusColor}; box-shadow: 0 0 5px ${statusColor};`;
        statusDiv.appendChild(dotSpan);

        const textSpan = document.createElement('span');
        textSpan.style.cssText = "opacity:0.7; text-transform:uppercase; letter-spacing:0.5px;";
        textSpan.textContent = data.status || 'ok';
        statusDiv.appendChild(textSpan);

        peekOverlay.appendChild(statusDiv);

        // Position logic
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let px = x + 15;
        let py = y + 15;

        // Force a layout calc to get bounds
        const rect = peekOverlay.getBoundingClientRect();

        if (px + rect.width > vw - 10) px = x - rect.width - 15;
        if (py + rect.height > vh - 10) py = y - rect.height - 15;

        peekOverlay.style.left = px + 'px';
        peekOverlay.style.top = py + 'px';

        // Trigger animation
        requestAnimationFrame(() => {
            peekOverlay.style.opacity = '1';
            peekOverlay.style.transform = 'translateY(0) scale(1)';
        });
    }

    function hidePeek() {
        if (peekOverlay) {
            peekOverlay.style.opacity = '0';
            peekOverlay.style.transform = 'translateY(10px) scale(0.95)';
            setTimeout(() => {
                if (peekOverlay.style.opacity === '0') peekOverlay.style.display = 'none';
            }, 200);
        }
    }

    function handleMouseOver(e) {
        // Look for bookmark links
        const target = e.target.closest('a');
        if (!target || !target.href || !target.closest('.category-card')) return;

        const url = target.href;

        // Only trigger if we have drift data
        if (window.EveSemanticDrift) {
            const health = window.EveSemanticDrift.getHealthInfo(url);
            if (health && (health.ogImage || health.ogDesc || health.status !== 'ok')) {
                clearTimeout(hoverTimer);
                hoverTimer = setTimeout(() => {
                    showPeek(e.clientX, e.clientY, health);
                }, 600); // 600ms hover delay
            }
        }
    }

    function handleMouseMove(e) {
        if (peekOverlay && peekOverlay.style.opacity === '1') {
            // we could track mouse, but let's keep it static once opened until mouseout
        }
    }

    function handleMouseOut(e) {
        clearTimeout(hoverTimer);
        hidePeek();
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initPhantomPeek();
    } else {
        document.addEventListener('DOMContentLoaded', initPhantomPeek);
    }
})();

// Bouncy dots canvas and phone widget runtime.
        // ==========================================
        // FEATURE 2: BOUNCY DOTS (Dual Mode)
        // ==========================================
        let bouncyDotsEnabled = false;
        let bouncyDotsMode = 'fullscreen'; // 'fullscreen' or 'phone'

        // --- Full-Screen Canvas Mode ---
        const bouncyDotsCanvas = document.getElementById('bouncyDotsCanvas');
        const bouncyDotsCtx = bouncyDotsCanvas.getContext('2d');
        bouncyDotsCanvas.width = canvas.width;
        bouncyDotsCanvas.height = canvas.height;

        const DOT_SPACING = 40;
        const DOT_BASE_SIZE = 2;
        const DOT_INFLUENCE_RADIUS = 150;
        const DOT_MAX_PUSH = 25;
        let dotMouseX = -1000;
        let dotMouseY = -1000;
        let dotGrid = [];

        function buildDotGrid() {
            dotGrid = [];
            const cols = Math.ceil(bouncyDotsCanvas.width / DOT_SPACING);
            const rows = Math.ceil(bouncyDotsCanvas.height / DOT_SPACING);
            const offsetX = (bouncyDotsCanvas.width - (cols - 1) * DOT_SPACING) / 2;
            const offsetY = (bouncyDotsCanvas.height - (rows - 1) * DOT_SPACING) / 2;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    dotGrid.push({
                        homeX: c * DOT_SPACING + offsetX,
                        homeY: r * DOT_SPACING + offsetY,
                        x: c * DOT_SPACING + offsetX,
                        y: r * DOT_SPACING + offsetY,
                        size: DOT_BASE_SIZE,
                        glow: 0
                    });
                }
            }
        }
        buildDotGrid();

        window.addEventListener('mousemove', (e) => {
            if (bouncyDotsEnabled && bouncyDotsMode === 'fullscreen') {
                dotMouseX = e.clientX;
                dotMouseY = e.clientY;
            }
        });

        function animateBouncyDots() {
            if (!bouncyDotsEnabled || bouncyDotsMode !== 'fullscreen') return;

            bouncyDotsCtx.clearRect(0, 0, bouncyDotsCanvas.width, bouncyDotsCanvas.height);

            for (let i = 0; i < dotGrid.length; i++) {
                const dot = dotGrid[i];
                const dx = dotMouseX - dot.homeX;
                const dy = dotMouseY - dot.homeY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < DOT_INFLUENCE_RADIUS) {
                    const influence = 1 - (dist / DOT_INFLUENCE_RADIUS);
                    const angle = Math.atan2(dy, dx);
                    const push = DOT_MAX_PUSH * influence;
                    dot.x = dot.homeX - Math.cos(angle) * push;
                    dot.y = dot.homeY - Math.sin(angle) * push;
                    dot.size = DOT_BASE_SIZE + influence * 4;
                    dot.glow = influence;
                } else {
                    dot.x += (dot.homeX - dot.x) * 0.15;
                    dot.y += (dot.homeY - dot.y) * 0.15;
                    dot.size += (DOT_BASE_SIZE - dot.size) * 0.15;
                    dot.glow += (0 - dot.glow) * 0.15;
                }

                bouncyDotsCtx.beginPath();
                bouncyDotsCtx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);

                if (dot.glow > 0.05) {
                    bouncyDotsCtx.fillStyle = color;
                    bouncyDotsCtx.shadowBlur = 8 * dot.glow;
                    bouncyDotsCtx.shadowColor = color;
                } else {
                    bouncyDotsCtx.fillStyle = `rgba(0, 255, 0, 0.15)`;
                    bouncyDotsCtx.shadowBlur = 0;
                }

                bouncyDotsCtx.fill();
                bouncyDotsCtx.shadowBlur = 0;
            }
        }

        // --- Phone Widget Mode ---
        const bouncyPhoneWidget = document.getElementById('bouncyPhoneWidget');
        const bouncyScreen = document.getElementById('bouncy-screen');
        const PHONE_DOT_ROWS = 22;
        const PHONE_DOT_COLS = 12;
        const PHONE_DOT_SPACING = 20;
        const PHONE_DOT_OFFSET_X = 25;
        const PHONE_DOT_OFFSET_Y = 15;
        let phoneDotsInitialized = false;

        function initializePhoneDots() {
            if (phoneDotsInitialized) return;
            const dotsContainer = document.getElementById('dots-container');
            for (let row = 0; row < PHONE_DOT_ROWS; row++) {
                for (let col = 0; col < PHONE_DOT_COLS; col++) {
                    const dot = document.createElement('div');
                    dot.className = 'phone-dot';
                    dot.style.left = `${col * PHONE_DOT_SPACING + PHONE_DOT_OFFSET_X}px`;
                    dot.style.top = `${row * PHONE_DOT_SPACING + PHONE_DOT_OFFSET_Y}px`;
                    dotsContainer.appendChild(dot);
                }
            }
            phoneDotsInitialized = true;
        }

        function updatePhoneDots(e) {
            const rect = bouncyScreen.getBoundingClientRect();
            let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            const dots = bouncyScreen.querySelectorAll('.phone-dot');
            dots.forEach(dot => {
                const dotLeft = parseFloat(dot.style.left);
                const dotTop = parseFloat(dot.style.top);
                const distance = Math.sqrt(Math.pow(x - dotLeft, 2) + Math.pow(y - dotTop, 2));
                const maxDistance = 80;

                if (distance < maxDistance) {
                    const scale = 1 + (1 - distance / maxDistance) * 2;
                    const angle = Math.atan2(y - dotTop, x - dotLeft);
                    const push = 15 * (1 - distance / maxDistance);
                    const moveX = Math.cos(angle) * push;
                    const moveY = Math.sin(angle) * push;

                    dot.style.backgroundColor = color;
                    dot.style.boxShadow = `0 0 5px ${color}`;
                    dot.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`;
                } else {
                    dot.style.backgroundColor = '';
                    dot.style.boxShadow = '';
                    dot.style.transform = 'none';
                }
            });
        }

        let isPhonePointerDown = false;

        bouncyScreen.addEventListener('pointerdown', (e) => {
            isPhonePointerDown = true;
            updatePhoneDots(e);
        });

        bouncyScreen.addEventListener('pointermove', (e) => {
            if (isPhonePointerDown) updatePhoneDots(e);
        });

        function resetPhoneDots() {
            isPhonePointerDown = false;
            const dots = bouncyScreen.querySelectorAll('.phone-dot');
            dots.forEach(dot => {
                dot.style.backgroundColor = '';
                dot.style.boxShadow = '';
                dot.style.transform = 'none';
            });
        }

        bouncyScreen.addEventListener('pointerup', resetPhoneDots);
        bouncyScreen.addEventListener('pointercancel', resetPhoneDots);
        bouncyScreen.addEventListener('pointerleave', resetPhoneDots);

        bouncyScreen.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        bouncyScreen.addEventListener('touchmove', (e) => { e.preventDefault(); updatePhoneDots(e); }, { passive: false });
        bouncyScreen.addEventListener('touchend', (e) => { e.preventDefault(); resetPhoneDots(); }, { passive: false });

        // Phone widget dragging
        let isDraggingPhone = false;
        let phoneDragOffX = 0;
        let phoneDragOffY = 0;

        document.getElementById('phoneDragBar').addEventListener('mousedown', (e) => {
            isDraggingPhone = true;
            phoneDragOffX = e.clientX - bouncyPhoneWidget.offsetLeft;
            phoneDragOffY = e.clientY - bouncyPhoneWidget.offsetTop;
            bouncyPhoneWidget.style.zIndex = 1001;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingPhone) return;
            e.preventDefault();
            let newX = Math.max(0, Math.min(e.clientX - phoneDragOffX, window.innerWidth - bouncyPhoneWidget.offsetWidth));
            let newY = Math.max(0, Math.min(e.clientY - phoneDragOffY, window.innerHeight - bouncyPhoneWidget.offsetHeight));
            bouncyPhoneWidget.style.left = `${newX}px`;
            bouncyPhoneWidget.style.top = `${newY}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingPhone) {
                isDraggingPhone = false;
                bouncyPhoneWidget.style.zIndex = 1000;
            }
        });

        // --- Mode Switching ---
        function switchBouncyDotsMode(mode) {
            bouncyDotsMode = mode;
            if (!bouncyDotsEnabled) return;

            if (mode === 'fullscreen') {
                bouncyDotsCanvas.style.display = 'block';
                bouncyPhoneWidget.style.display = 'none';
            } else {
                bouncyDotsCanvas.style.display = 'none';
                bouncyDotsCtx.clearRect(0, 0, bouncyDotsCanvas.width, bouncyDotsCanvas.height);
                bouncyPhoneWidget.style.display = 'block';
                initializePhoneDots();
            }
        }

        function toggleBouncyDots(checked) {
            bouncyDotsEnabled = checked;
            document.getElementById('bouncyDotsOptions').style.display = checked ? 'block' : 'none';

            if (checked) {
                switchBouncyDotsMode(bouncyDotsMode);
            } else {
                bouncyDotsCanvas.style.display = 'none';
                bouncyDotsCtx.clearRect(0, 0, bouncyDotsCanvas.width, bouncyDotsCanvas.height);
                bouncyPhoneWidget.style.display = 'none';
            }
        }


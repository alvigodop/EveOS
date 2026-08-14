// Matrix rain state, column setup, and interactive particles.
        const canvas = document.getElementById('matrix');
        const ctx = canvas.getContext('2d');
        const gridCanvas = document.getElementById('gridCanvas');
        const gridCtx = gridCanvas.getContext('2d');
        const interactiveParticleCanvas = document.getElementById('interactiveParticleCanvas');
        const interactiveCtx = interactiveParticleCanvas.getContext('2d');
        let animationFrameId;
        let lastFrameTime = Date.now();
        let fps = 0;
        let frameCount = 0;
        let lastFpsTime = Date.now();

        // Canvas dimensions in CSS pixels. Every drawing and bounds check works in this space; the
        // backing store is separately scaled by the device pixel ratio below.
        let viewWidth = window.innerWidth;
        let viewHeight = window.innerHeight;

        // Sizing a canvas purely from innerWidth/innerHeight gives it a 1:1 backing store, so on any
        // high-DPI display the browser upscales the result and the glyphs come out soft. Size the
        // buffer in device pixels, pin the CSS box to the layout size, then scale the context so all
        // existing draw calls keep speaking CSS pixels and need no coordinate maths of their own.
        function sizeCanvas(element, context) {
            const ratio = Math.max(1, window.devicePixelRatio || 1);
            element.width = Math.round(viewWidth * ratio);
            element.height = Math.round(viewHeight * ratio);
            element.style.width = `${viewWidth}px`;
            element.style.height = `${viewHeight}px`;
            // setTransform, not scale: this runs again on every resize and scale() would compound.
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        }

        function sizeAllCanvases() {
            viewWidth = window.innerWidth;
            viewHeight = window.innerHeight;
            sizeCanvas(canvas, ctx);
            sizeCanvas(gridCanvas, gridCtx);
            sizeCanvas(interactiveParticleCanvas, interactiveCtx);
            if (typeof bouncyDotsCanvas !== 'undefined' && typeof bouncyDotsCtx !== 'undefined') {
                sizeCanvas(bouncyDotsCanvas, bouncyDotsCtx);
            }
        }

        sizeAllCanvases();

        let katakana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン';
        let latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let nums = '0123456789';

        let alphabet = katakana + latin + nums;

        let fontSize = 16;
        let columns = viewWidth / fontSize;

        let rainDrops = [];
        let rainDropsChars = [];
        for (let x = 0; x < columns; x++) {
            rainDrops[x] = 1;
            rainDropsChars[x] = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }

        let color = '#0f0';
        let speed = 50;
        let paused = false;
        let fadeSpeed = 0.05;
        let lineChangeRate = 1; // Number of lines to pass before changing character
        let minLineChange = 1;
        let maxLineChange = 4;
        let interval;

        let particles = [];
        const PARTICLE_LIFETIME = 100;
        let gradientColors = null;

        let selectedChars = new Set(); // Store selected characters

        let gradientMode = false;
        let glowEnabled = false;
        let gridEnabled = false;
        let particlesEnabled = false;
        let lightingEnabled = false;

        let gridColor = '#00ff00';
        let gridOpacity = 0.15;

        let particleColor = '#00ff00';
        let lightingColor = '#00ff00';

        let sequenceEnabled = false;
        let sequenceMode = 'random';
        let customSequence = '';
        let trailLength = 3;
        let colorCycleSpeed = 2;
        let colorCycleEnabled = false;
        let currentSequenceIndex = 0;
        let lastColorChange = Date.now();

        // Add new variables for movement controls
        let movementEnabled = false;
        let horizontalMovement = 0;
        let precipitationMode = 'continuous';
        let spawnDelay = 500;
        let lineSpacing = 4;
        let columnOffsets = [];
        let lastSpawnTimes = [];
        let columnPhases = [];
        let currentColumn = 0; // For single line mode

        // Add new variables for enhanced movement controls
        let density = 5;
        let columnVelocities = [];
        let columnGaps = [];
        let baseVerticalSpeed = 80; // pixels per second

        // Add new variable for movement range
        let movementRange = 15; // Default 15 pixels

        // Add new variables for enhanced density controls
        let densePack = 3;
        let trailChars = 3;
        let lineVariation = 30;
        let columnDelays = [];

        // Add new waterfall variables
        let waterfallEnabled = false;
        let waterfallIntensity = 50; // Default middle value
        let columnSpeeds = [];

        // Initialize column-specific variables
        function initializeColumns() {
            columnOffsets = new Array(Math.ceil(columns)).fill(0);
            lastSpawnTimes = new Array(Math.ceil(columns)).fill(0);
            columnPhases = new Array(Math.ceil(columns)).fill(0).map(() => Math.random() * Math.PI * 2);
            columnVelocities = new Array(Math.ceil(columns)).fill(baseVerticalSpeed);
            columnGaps = new Array(Math.ceil(columns)).fill(fontSize);
            columnDelays = new Array(Math.ceil(columns)).fill(0).map(() => Math.random() * lineVariation);
            columnSpeeds = new Array(Math.ceil(columns)).fill(1); // Initialize column speeds for waterfall
        }

        // ==========================================
        // FEATURE 1: INTERACTIVE PARTICLE PLAYGROUND
        // ==========================================
        let interactiveParticlesEnabled = false;
        let interactiveParticlesArray = [];

        class InteractiveParticle {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.size = Math.random() * 10 + 2;
                this.speedX = Math.random() * 3 - 1.5;
                this.speedY = Math.random() * 3 - 1.5;
                this.color = color; // Use the current matrix color
                this.life = 100;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.life -= 2;
                if (this.size > 0.1) this.size -= 0.1;
            }

            draw() {
                interactiveCtx.fillStyle = this.color;
                interactiveCtx.shadowBlur = 10;
                interactiveCtx.shadowColor = this.color;
                interactiveCtx.beginPath();
                interactiveCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                interactiveCtx.fill();
                interactiveCtx.shadowBlur = 0;
            }
        }

        function createInteractiveParticles(e) {
            if (!interactiveParticlesEnabled) return;
            let mouseX = e.clientX;
            let mouseY = e.clientY;
            for (let i = 0; i < 3; i++) {
                interactiveParticlesArray.push(new InteractiveParticle(mouseX, mouseY));
            }
        }

        window.addEventListener('mousemove', createInteractiveParticles);

        function animateInteractiveParticles() {
            if (!interactiveParticlesEnabled) return;

            interactiveCtx.clearRect(0, 0, viewWidth, viewHeight);

            for (let i = 0; i < interactiveParticlesArray.length; i++) {
                let particle = interactiveParticlesArray[i];
                // Sync color with current matrix color
                particle.color = color;
                particle.update();
                particle.draw();

                if (particle.life <= 0) {
                    interactiveParticlesArray.splice(i, 1);
                    i--;
                }
            }
        }

        function toggleInteractiveParticles(checked) {
            interactiveParticlesEnabled = checked;
            interactiveParticleCanvas.style.display = checked ? 'block' : 'none';
            if (!checked) {
                interactiveCtx.clearRect(0, 0, viewWidth, viewHeight);
                interactiveParticlesArray = [];
            }
        }


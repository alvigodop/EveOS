window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const fxWebGlQuantumShaders = ns._fxWebGlQuantumShaders || {};
    const fxWebGlQuantumNetwork = ns._fxWebGlQuantumNetwork || {};
    const fxWebGlQuantumMeshes = ns._fxWebGlQuantumMeshes || {};

    const { BaseEffect, NOISE_GLSL } = fxBase;
    const { createQuantumNodeShader, createQuantumConnectionShader } = fxWebGlQuantumShaders;
    const { createQuantumNetwork } = fxWebGlQuantumNetwork;
    const { buildQuantumMeshes } = fxWebGlQuantumMeshes;

    class QuantumNeuralEffect extends BaseEffect {
        async init(container) {
            super.init(container);

            const THREE = await import('three');
            const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
            const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
            const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
            const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setClearColor(0x000000, 0);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 8, 45);

            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.8, 0.6, 0.7);
            this.composer.addPass(this.bloomPass);
            this.composer.addPass(new OutputPass());

            this.clock = new THREE.Clock();
            this.config = { paused: false, activePaletteIndex: 0, currentFormation: 0, densityFactor: 1 };

            this.pulseUniforms = {
                uTime: { value: 0.0 },
                uPulsePositions: { value: [new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3)] },
                uPulseTimes: { value: [-1e3, -1e3, -1e3] },
                uPulseColors: { value: [new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1)] },
                uPulseSpeed: { value: 18.0 },
                uBaseNodeSize: { value: 0.6 }
            };

            this.colorPalettes = [
                [new THREE.Color(0x667eea), new THREE.Color(0x764ba2), new THREE.Color(0xf093fb), new THREE.Color(0x9d50bb), new THREE.Color(0x6e48aa)],
                [new THREE.Color(0xf857a6), new THREE.Color(0xff5858), new THREE.Color(0xfeca57), new THREE.Color(0xff6348), new THREE.Color(0xff9068)],
                [new THREE.Color(0x4facfe), new THREE.Color(0x00f2fe), new THREE.Color(0x43e97b), new THREE.Color(0x38f9d7), new THREE.Color(0x4484ce)]
            ];

            const nodeShader = createQuantumNodeShader(NOISE_GLSL);
            const connectionShader = createQuantumConnectionShader(NOISE_GLSL);
            const networkNodes = createQuantumNetwork(THREE, 0);
            const palette = this.colorPalettes[0];
            const meshes = buildQuantumMeshes(THREE, networkNodes, palette, this.pulseUniforms, nodeShader, connectionShader);
            this.nodesMesh = meshes.nodesMesh;
            this.connectionsMesh = meshes.connectionsMesh;
            this.scene.add(this.nodesMesh);
            this.scene.add(this.connectionsMesh);

            this.onMapClick = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
                const ray = new THREE.Raycaster();
                ray.setFromCamera(mouse, this.camera);
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
                const intersect = new THREE.Vector3();
                if (ray.ray.intersectPlane(plane, intersect)) {
                    const idx = (Math.floor(this.clock.getElapsedTime() * 10)) % 3;
                    this.pulseUniforms.uPulsePositions.value[idx].copy(intersect);
                    this.pulseUniforms.uPulseTimes.value[idx] = this.clock.getElapsedTime();
                }
            };
            this.canvas.addEventListener('click', this.onMapClick);

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const t = this.clock.getElapsedTime();
                this.pulseUniforms.uTime.value = t;
                this.nodesMesh.rotation.y = Math.sin(t * 0.04) * 0.05;
                this.composer.render();
            };
            animate();
        }

        dispose() {
            super.dispose();
            if (this.canvas) this.canvas.removeEventListener('click', this.onMapClick);
            if (this.nodesMesh) { this.nodesMesh.geometry.dispose(); this.nodesMesh.material.dispose(); }
            if (this.connectionsMesh) { this.connectionsMesh.geometry.dispose(); this.connectionsMesh.material.dispose(); }
            if (this.renderer) this.renderer.dispose();
        }
    }

    const fxWebGlQuantum = ns._fxWebGlQuantum = ns._fxWebGlQuantum || {};
    Object.assign(fxWebGlQuantum, {
        QuantumNeuralEffect
    });
})(window.EveConstellationMap);

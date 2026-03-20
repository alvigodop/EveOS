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
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setClearColor(0x000000, 0);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
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
            this.bindPointer(this.canvas);
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
            this.addCleanup(() => this.canvas?.removeEventListener('click', this.onMapClick));
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const t = this.clock.getElapsedTime();
                this.syncSettings(t);
                this.composer.render();
            };
            animate();
        }

        resize() {
            if (!this.renderer || !this.camera) return;
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(this.width, this.height);
            this.camera.aspect = this.width / Math.max(1, this.height);
            this.camera.updateProjectionMatrix();
            this.composer.setSize(this.width, this.height);
            this.bloomPass.resolution.set(this.width, this.height);
        }

        syncSettings(timeSeconds) {
            const glow = this.getFxValue('glow');
            const speed = this.getFxValue('speed');
            const parallax = this.getFxValue('parallax');
            this.updatePointerIdle(timeSeconds);
            this.pulseUniforms.uTime.value = timeSeconds * speed;
            this.pulseUniforms.uPulseSpeed.value = 12 + glow * 10;
            this.pulseUniforms.uBaseNodeSize.value = 0.52 + glow * 0.26;
            this.nodesMesh.rotation.y = Math.sin(timeSeconds * 0.22) * 0.08;
            this.connectionsMesh.rotation.y = Math.cos(timeSeconds * 0.16) * 0.05;
            this.camera.position.x += (((this.pointer.x - 0.5) * 16 * parallax) - this.camera.position.x) * 0.04;
            this.camera.position.y += (((this.pointer.y - 0.5) * -10 * parallax) + 8 - this.camera.position.y) * 0.04;
            this.camera.lookAt(0, 0, 0);
            this.bloomPass.strength = 1.12 + glow * 0.74;
        }

        dispose() {
            super.dispose();
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

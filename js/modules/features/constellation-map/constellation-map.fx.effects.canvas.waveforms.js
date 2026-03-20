window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

    class WavesEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
            this.camera.position.set(0, 58, 132);
            this.camera.lookAt(0, 0, 0);
            this.geometry = new THREE.PlaneGeometry(620, 620, 82, 82);
            this.material = new THREE.MeshBasicMaterial({ color: 0x37d6ff, wireframe: true, transparent: true, opacity: 0.23 });
            this.plane = new THREE.Mesh(this.geometry, this.material);
            this.plane.rotation.x = -Math.PI / 2;
            this.scene.add(this.plane);
            this.bindPointer(this.canvas);
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.drawFrame(time);
            };
            animate();
        }

        resize() {
            if (!this.renderer || !this.camera) return;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
            this.camera.updateProjectionMatrix();
            this.width = window.innerWidth;
            this.height = window.innerHeight;
        }

        drawFrame(time) {
            const speed = this.getFxValue('speed');
            const glow = this.getFxValue('glow');
            const interaction = this.getFxValue('interaction');
            const parallax = this.getFxValue('parallax');
            const positions = this.plane.geometry.attributes.position.array;
            for (let index = 0; index < positions.length; index += 3) {
                const x = positions[index];
                const y = positions[index + 1];
                const ridge = Math.sin((x * 0.028) + time * speed * 1.2) * (10 + glow * 10);
                const cross = Math.cos((y * 0.031) - time * speed * 1.4) * (9 + glow * 9);
                const pulse = Math.sin(((x + y) * 0.018) + time * speed * 1.7) * 4;
                positions[index + 2] = ridge + cross + pulse;
            }
            this.plane.geometry.attributes.position.needsUpdate = true;
            if (this.getFxFlag('parallaxEnabled')) {
                this.camera.position.x += (((this.pointer.x - 0.5) * 28 * parallax) - this.camera.position.x) * 0.04;
                this.camera.position.y += (((46 + (this.pointer.y - 0.5) * -14 * parallax)) - this.camera.position.y) * 0.04;
            }
            this.material.opacity = 0.14 + glow * 0.12;
            this.plane.rotation.z = Math.sin(time * 0.14) * 0.04;
            this.plane.position.x = (this.pointer.x - 0.5) * 24 * interaction;
            this.renderer.render(this.scene, this.camera);
        }

        dispose() {
            super.dispose();
            if (this.geometry) this.geometry.dispose();
            if (this.material) this.material.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    class DotWaveEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1400);
            this.camera.position.set(0, 54, 162);
            this.camera.lookAt(0, 0, 0);
            this.bindPointer(this.canvas);
            this.buildGrid();
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.drawFrame(time);
            };
            animate();
        }

        buildGrid() {
            const THREE = this.THREE;
            const density = this.getFxValue('density');
            const amountX = Math.max(30, Math.round(34 + density * 24));
            const amountY = Math.max(24, Math.round(28 + density * 20));
            const count = amountX * amountY;
            const separation = 14;
            const positions = new Float32Array(count * 3);
            const scales = new Float32Array(count);
            let index = 0;
            for (let ix = 0; ix < amountX; ix += 1) {
                for (let iy = 0; iy < amountY; iy += 1) {
                    positions[index * 3] = (ix * separation) - ((amountX * separation) / 2);
                    positions[index * 3 + 1] = 0;
                    positions[index * 3 + 2] = (iy * separation) - ((amountY * separation) / 2);
                    scales[index] = 5;
                    index += 1;
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
            const material = new THREE.ShaderMaterial({
                uniforms: { color: { value: new THREE.Color(0x5ae7ff) }, glow: { value: 1 } },
                vertexShader: `attribute float scale; varying float vScale; void main(){ vScale = scale; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = scale * (260.0 / -mvPosition.z); gl_Position = projectionMatrix * mvPosition; }`,
                fragmentShader: `uniform vec3 color; uniform float glow; varying float vScale; void main(){ float d = length(gl_PointCoord - vec2(0.5)); if (d > 0.48) discard; float alpha = smoothstep(0.48, 0.0, d) * (0.32 + glow * 0.22); gl_FragColor = vec4(color, alpha); }`,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            this.points = new THREE.Points(geometry, material);
            this.scene.add(this.points);
            this.gridConfig = { amountX, amountY, separation };
        }

        resize() {
            if (!this.renderer || !this.camera) return;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
            this.camera.updateProjectionMatrix();
            this.width = window.innerWidth;
            this.height = window.innerHeight;
        }

        drawFrame(time) {
            const speed = this.getFxValue('speed');
            const glow = this.getFxValue('glow');
            const interaction = this.getFxValue('interaction');
            const parallax = this.getFxValue('parallax');
            const positions = this.points.geometry.attributes.position.array;
            const scales = this.points.geometry.attributes.scale.array;
            const amountY = this.gridConfig.amountY;
            for (let index = 0; index < scales.length; index += 1) {
                const ix = Math.floor(index / amountY);
                const iy = index % amountY;
                const baseX = positions[index * 3];
                const baseZ = positions[index * 3 + 2];
                const wave = Math.sin((ix * 0.32) + time * speed * 1.8) * 18 + Math.cos((iy * 0.46) - time * speed * 1.3) * 14;
                const px = ((this.pointer.x - 0.5) * 2) * 120;
                const pz = ((this.pointer.y - 0.5) * 2) * 120;
                const distance = Math.hypot(baseX - px, baseZ - pz);
                const pulse = Math.max(0, 1 - distance / (120 + interaction * 80)) * (16 + interaction * 22);
                positions[index * 3 + 1] = wave + pulse;
                scales[index] = 4 + glow * 4 + pulse * 0.18;
            }
            this.points.geometry.attributes.position.needsUpdate = true;
            this.points.geometry.attributes.scale.needsUpdate = true;
            this.points.material.uniforms.glow.value = glow;
            if (this.getFxFlag('parallaxEnabled')) {
                this.camera.position.x += (((this.pointer.x - 0.5) * 34 * parallax) - this.camera.position.x) * 0.04;
                this.camera.position.z += ((((this.pointer.y - 0.5) * 38 * parallax) + 162) - this.camera.position.z) * 0.04;
            }
            this.renderer.render(this.scene, this.camera);
        }

        dispose() {
            super.dispose();
            if (this.points) {
                this.points.geometry.dispose();
                this.points.material.dispose();
            }
            if (this.renderer) this.renderer.dispose();
        }
    }

    const fxCanvasWaveforms = ns._fxCanvasWaveforms = ns._fxCanvasWaveforms || {};
    Object.assign(fxCanvasWaveforms, {
        WavesEffect,
        DotWaveEffect
    });
})(window.EveConstellationMap);

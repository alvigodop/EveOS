window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

    class SolarisEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
            const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
            const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
            const { AfterimagePass } = await import('three/addons/postprocessing/AfterimagePass.js');
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.08;
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
            this.camera.position.set(0, 10, 120);
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.afterimage = new AfterimagePass(0.9);
            this.composer.addPass(this.afterimage);
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.8, 0.05);
            this.composer.addPass(this.bloomPass);
            this.clock = new THREE.Clock();
            this.bindPointer(this.canvas);
            this.coreGroup = new THREE.Group();
            this.scene.add(this.coreGroup);
            this.coreMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uCore: { value: new THREE.Color(1.0, 0.8, 0.2) } },
                vertexShader: `varying vec3 vN; uniform float time; ${NOISE_GLSL} void main(){ vN=normalize(normal); float d=snoise(normal*3.0+time*0.7)*0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0); }`,
                fragmentShader: `varying vec3 vN; uniform vec3 uCore; void main(){ float f=pow(1.0-abs(dot(vN,vec3(0,0,1))),3.0); gl_FragColor=vec4(uCore*(0.5+f*2.5),1.0); }`,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            this.coreGroup.add(new THREE.Mesh(new THREE.IcosahedronGeometry(30, 5), this.coreMat));
            this.shellMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uShell: { value: new THREE.Color(1.0, 0.4, 0.0) } },
                vertexShader: `varying vec3 vN; uniform float time; ${NOISE_GLSL} void main(){ vN=normalize(normal); float d=snoise(position*1.5+time*0.4)*1.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0); }`,
                fragmentShader: `varying vec3 vN; uniform vec3 uShell; void main(){ float f=pow(1.0-abs(dot(vN,vec3(0,0,1))),0.6); gl_FragColor=vec4(uShell,f*0.5); }`,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            this.coreGroup.add(new THREE.Mesh(new THREE.IcosahedronGeometry(35, 5), this.shellMat));
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
            if (this.composer) this.composer.setSize(this.width, this.height);
            if (this.bloomPass?.resolution) this.bloomPass.resolution.set(this.width, this.height);
        }

        syncSettings(timeSeconds) {
            const glow = this.getFxValue('glow');
            const speed = this.getFxValue('speed');
            const parallax = this.getFxValue('parallax');
            this.updatePointerIdle(timeSeconds);
            this.coreMat.uniforms.time.value = timeSeconds * speed;
            this.shellMat.uniforms.time.value = timeSeconds * speed;
            this.coreGroup.rotation.y += 0.0014 * speed;
            this.coreGroup.rotation.x = Math.sin(timeSeconds * 0.18) * 0.12;
            this.camera.position.x += (((this.pointer.x - 0.5) * 12 * parallax) - this.camera.position.x) * 0.04;
            this.camera.position.y += (((this.pointer.y - 0.5) * -10 * parallax) + 10 - this.camera.position.y) * 0.04;
            this.camera.lookAt(0, 0, 0);
            this.bloomPass.strength = 0.9 + glow * 0.7;
            this.afterimage.uniforms.damp.value = Math.max(0.82, 0.94 - (speed * 0.02));
        }

        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    class TokamakEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
            const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
            const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x000000, 0);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 0, 150);
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.5, 0.8);
            this.composer.addPass(this.bloomPass);
            this.clock = new THREE.Clock();
            this.bindPointer(this.canvas);
            const shellMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uColor: { value: new THREE.Color(0x35a6ff) } },
                vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: `varying vec2 vUv; uniform float time; uniform vec3 uColor; void main(){ vec2 g=fract(vUv*50.0); float s=step(0.1,g.x)*step(0.1,g.y); float p=0.5+0.5*sin(time*2.0+vUv.x*10.0); gl_FragColor=vec4(uColor,s*p*0.24); }`,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            this.shellMat = shellMat;
            this.shell = new THREE.Mesh(new THREE.TorusGeometry(60, 20, 32, 100), shellMat);
            this.scene.add(this.shell);
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = this.clock.getElapsedTime();
                this.syncSettings(time);
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
            if (this.composer) this.composer.setSize(this.width, this.height);
        }

        syncSettings(timeSeconds) {
            const speed = this.getFxValue('speed');
            const glow = this.getFxValue('glow');
            const parallax = this.getFxValue('parallax');
            this.updatePointerIdle(timeSeconds);
            this.shellMat.uniforms.time.value = timeSeconds * speed;
            this.shell.rotation.x += 0.0016 * speed;
            this.shell.rotation.y += 0.0034 * speed;
            this.camera.position.x += (((this.pointer.x - 0.5) * 20 * parallax) - this.camera.position.x) * 0.05;
            this.camera.position.y += (((this.pointer.y - 0.5) * -16 * parallax) - this.camera.position.y) * 0.05;
            this.camera.lookAt(0, 0, 0);
            this.bloomPass.strength = 0.74 + glow * 0.62;
        }

        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    const fxWebGlThree = ns._fxWebGlThree = ns._fxWebGlThree || {};
    Object.assign(fxWebGlThree, {
        SolarisEffect,
        TokamakEffect
    });
})(window.EveConstellationMap);

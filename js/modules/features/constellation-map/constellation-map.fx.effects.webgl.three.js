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

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.1;
            
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
            this.camera.position.set(0, 10, 120);

            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.composer.addPass(new AfterimagePass(0.9));
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.8, 0.05);
            this.composer.addPass(this.bloomPass);

            const clock = new THREE.Clock();
            const coreGroup = new THREE.Group();
            this.scene.add(coreGroup);

            // Core
            const coreMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uCore: { value: new THREE.Color(1.0, 0.8, 0.2) } },
                vertexShader: `varying vec3 vN; uniform float time; ${NOISE_GLSL} void main(){ vN=normalize(normal); float d=snoise(normal*3.0+time*0.7)*0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0); }`,
                fragmentShader: `varying vec3 vN; uniform float time; uniform vec3 uCore; void main(){ float f=pow(1.0-abs(dot(vN,vec3(0,0,1))),3.0); gl_FragColor=vec4(uCore*(0.5+f*2.5),1.0); }`,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            coreGroup.add(new THREE.Mesh(new THREE.IcosahedronGeometry(30, 5), coreMat));

            // Shell
            const shellMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uShell: { value: new THREE.Color(1.0, 0.4, 0.0) } },
                vertexShader: `varying vec3 vN; uniform float time; ${NOISE_GLSL} void main(){ vN=normalize(normal); float d=snoise(position*1.5+time*0.4)*1.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0); }`,
                fragmentShader: `varying vec3 vN; uniform float time; uniform vec3 uShell; void main(){ float f=pow(1.0-abs(dot(vN,vec3(0,0,1))),0.6); gl_FragColor=vec4(uShell,f*0.5); }`,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });
            coreGroup.add(new THREE.Mesh(new THREE.IcosahedronGeometry(35, 5), shellMat));

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const t = clock.getElapsedTime();
                coreMat.uniforms.time.value = t;
                shellMat.uniforms.time.value = t;
                coreGroup.rotation.y += 0.002;
                this.composer.render();
            };
            animate();
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

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x000000, 0);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 0, 150);

            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.5, 0.8));

            const clock = new THREE.Clock();
            const shellMat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uColor: { value: new THREE.Color(0x0088ff) } },
                vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: `varying vec2 vUv; uniform float time; uniform vec3 uColor; void main(){ vec2 g=fract(vUv*50.0); float s=step(0.1,g.x)*step(0.1,g.y); float p=0.5+0.5*sin(time*2.0+vUv.x*10.0); gl_FragColor=vec4(uColor,s*p*0.2); }`,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            this.shell = new THREE.Mesh(new THREE.TorusGeometry(60, 20, 32, 100), shellMat);
            this.scene.add(this.shell);

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                shellMat.uniforms.time.value = clock.getElapsedTime();
                this.shell.rotation.x += 0.002;
                this.shell.rotation.y += 0.005;
                this.composer.render();
            };
            animate();
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

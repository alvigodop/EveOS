window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared;
    const state = shared.state;

    /**
     * FXManager handles the lifecycle of background effects.
     */
    class FXManager {
        constructor() {
            this.engines = new Map();
            this.activeEngine = null;
            this.container = null;
            this.initialized = false;
        }

        init(container) {
            this.container = container;
            this.initialized = true;
            this.update();
        }

        register(name, EngineClass) {
            this.engines.set(name, EngineClass);
        }

        update() {
            if (!this.initialized) return;

            const targetFx = state.activeWebGlFx || 'none';
            
            if (this.activeEngine?.name !== targetFx) {
                if (this.activeEngine) {
                    this.activeEngine.instance.dispose();
                    this.activeEngine = null;
                }

                if (targetFx !== 'none' && this.engines.has(targetFx)) {
                    const EngineClass = this.engines.get(targetFx);
                    const instance = new EngineClass();
                    instance.init(this.container);
                    this.activeEngine = { name: targetFx, instance };
                }
            }

            this.updateCssLayers();
        }

        updateCssLayers() {
            if (!this.container) return;
            this.container.classList.toggle('fx-grid-enabled', !!state.fxGridEnabled);
            this.container.classList.toggle('fx-scanline-enabled', !!state.fxScanlineEnabled);
            this.container.classList.toggle('fx-tech-enabled', !!state.fxTechEnabled);
            this.container.classList.toggle('fx-circuit-enabled', !!state.fxCircuitEnabled);
        }

        dispose() {
            if (this.activeEngine) {
                this.activeEngine.instance.dispose();
                this.activeEngine = null;
            }
            this.initialized = false;
        }
    }

    class BaseEffect {
        constructor() {
            this.container = null;
            this.canvas = null;
            this.running = false;
            this.animationFrame = null;
        }
        init(container) {
            this.container = container;
            this.running = true;
        }
        dispose() {
            this.running = false;
            if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
            if (this.canvas && this.canvas.parentElement) {
                this.canvas.parentElement.removeChild(this.canvas);
            }
        }
    }

    const NOISE_GLSL = `
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
    `;

    /**
     * Solaris Effect (Genesis Engine - Full Fidelity)
     */
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

    /**
     * Quantum Neural Effect (High Fidelity Morphing & Pulses)
     */
    class QuantumNeuralEffect extends BaseEffect {
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
            this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 0, 150);

            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85));

            const nodeCount = 400;
            const positions = new Float32Array(nodeCount * 3);
            const clock = new THREE.Clock();

            for(let i=0; i<nodeCount; i++) {
                const phi = Math.acos(1 - 2 * (i / nodeCount));
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                positions[i*3] = 80 * Math.sin(phi) * Math.cos(theta);
                positions[i*3+1] = 80 * Math.sin(phi) * Math.sin(theta);
                positions[i*3+2] = 80 * Math.cos(phi);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const mat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, uColor: { value: new THREE.Color(0x00d4ff) } },
                vertexShader: `varying vec3 vPos; uniform float time; ${NOISE_GLSL} void main(){ vPos=position; float d=snoise(position*0.05+time*0.1)*5.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0); gl_PointSize=2.0; }`,
                fragmentShader: `varying vec3 vPos; uniform vec3 uColor; void main(){ float alpha=0.6; gl_FragColor=vec4(uColor,alpha); }`,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });

            this.points = new THREE.Points(geom, mat);
            this.scene.add(this.points);

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                mat.uniforms.time.value = clock.getElapsedTime();
                this.points.rotation.y += 0.001;
                this.composer.render();
            };
            animate();
        }
        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    /**
     * Tokamak Effect (Torus Plasma + Trails)
     */
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

    /**
     * Memento Effect (Highlight Raymarching)
     */
    class RaymarchingEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.Camera();

            const mat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) } },
                vertexShader: `void main(){ gl_Position=vec4(position,1.0); }`,
                fragmentShader: `
                    precision highp float;
                    uniform float time;
                    uniform vec2 resolution;
                    #define rot(a) mat2(cos(a),-sin(a),sin(a),cos(a))
                    float map(vec3 p){
                        p.xz*=rot(time*0.3); p.xy*=rot(time*0.2);
                        vec3 q=abs(p)-1.0; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-0.1;
                    }
                    void main(){
                        vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/min(resolution.y,resolution.x);
                        vec3 ro=vec3(0,0,-4), rd=normalize(vec3(uv,1.5));
                        float t=0.0; for(int i=0; i<80; i++){ float d=map(ro+rd*t); if(d<0.001||t>10.0) break; t+=d; }
                        vec3 col=vec3(0.0); if(t<10.0){
                            vec3 n=normalize(vec3(map(ro+rd*t+vec3(0.01,0,0))-map(ro+rd*t-vec3(0.01,0,0)), map(ro+rd*t+vec3(0,0.01,0))-map(ro+rd*t-vec3(0,0.01,0)), map(ro+rd*t+vec3(0,0,0.01))-map(ro+rd*t-vec3(0,0,0.01))));
                            col=vec3(0.2,0.6,1.0)*dot(n,normalize(vec3(1,2,-1)))*(1.0-t/10.0);
                        }
                        gl_FragColor=vec4(col,0.4);
                    }
                `,
                transparent: true, blending: THREE.AdditiveBlending
            });
            this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat));

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                mat.uniforms.time.value += 0.01;
                this.renderer.render(this.scene, this.camera);
            };
            animate();
        }
        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    /**
     * Memento Effect (Canvas Trajectories)
     */
    class MementoEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            const ctx = this.canvas.getContext('2d');
            const particles = Array.from({length: 60}, () => ({
                x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
                vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, h: []
            }));
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                ctx.fillStyle = 'rgba(0, 5, 12, 0.15)';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
                particles.forEach(p => {
                    p.x+=p.vx; p.y+=p.vy;
                    if(p.x<0||p.x>this.canvas.width) p.vx*=-1;
                    if(p.y<0||p.y>this.canvas.height) p.vy*=-1;
                    p.h.push({x:p.x, y:p.y}); if(p.h.length>40) p.h.shift();
                    if(p.h.length>1){
                        ctx.beginPath(); ctx.moveTo(p.h[0].x, p.h[0].y);
                        for(let i=1; i<p.h.length; i++) ctx.lineTo(p.h[i].x, p.h[i].y);
                        ctx.stroke();
                    }
                });
            };
            animate();
        }
    }

    /**
     * Attraction Effect (Neon Mouse Trail)
     */
    class AttractionEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            const ctx = this.canvas.getContext('2d');
            let mouse = { x: this.canvas.width / 2, y: this.canvas.height / 2 }, trail = [];
            const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
            window.addEventListener('mousemove', onMove);
            this.cleanup = () => window.removeEventListener('mousemove', onMove);
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                trail.push({ ...mouse }); if(trail.length > 30) trail.shift();
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                if(trail.length < 2) return;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for(let i=1; i<trail.length; i++) {
                    const r = i / trail.length;
                    ctx.beginPath(); ctx.strokeStyle = `rgba(0, 255, 255, ${r * 0.6})`;
                    ctx.lineWidth = r * 10; ctx.moveTo(trail[i-1].x, trail[i-1].y);
                    ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
                }
            };
            animate();
        }
        dispose() { super.dispose(); if(this.cleanup) this.cleanup(); }
    }

    /**
     * Art Effect (Generative Waves)
     */
    class ArtEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            const ctx = this.canvas.getContext('2d');
            let frame = 0;
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                frame++; ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.strokeStyle = `rgba(0, 255, 255, 0.2)`;
                const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
                for(let i=0; i<60; i++) {
                    const ph = (i / 60) * Math.PI * 2;
                    ctx.beginPath();
                    for(let j=0; j<=100; j++) {
                        const t = j / 100, y = (t - 0.5) * (this.canvas.height * 0.7);
                        const env = Math.sin(t * Math.PI);
                        const w = Math.sin(frame * 0.04 + ph) * 60 + Math.cos(t * 10 + frame * 0.08) * 40;
                        const x = env * (w + 120);
                        if(j === 0) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
                    }
                    ctx.stroke();
                }
            };
            animate();
        }
    }

    /**
     * ASCII Effect (Matrix Flow)
     */
    class AsciiEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.div = document.createElement('div');
            this.div.className = 'map-fx-layer';
            this.div.style.cssText = 'position:absolute;inset:0;font-family:monospace;font-size:10px;line-height:8px;color:rgba(0,255,200,0.3);white-space:pre;overflow:hidden;user-select:none;pointer-events:none;';
            container.prepend(this.div);
            const chars = '@#%*+=-:. ', cols = Math.floor(window.innerWidth / 8), rows = Math.floor(window.innerHeight / 8);
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                let text = ''; const t = Date.now() * 0.001;
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const n = Math.sin(x * 0.1 + t) + Math.cos(y * 0.1 + t * 0.7);
                        const idx = Math.floor(((n + 2) / 4) * (chars.length - 1));
                        text += chars[Math.min(Math.max(idx, 0), chars.length - 1)];
                    }
                    text += '\n';
                }
                this.div.textContent = text;
            };
            animate();
        }
        dispose() {
            this.running = false;
            if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
            if (this.div && this.div.parentElement) this.div.parentElement.removeChild(this.div);
        }
    }

    /**
     * Waves Effect (Harmonic Grid)
     */
    class WavesEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 60, 120); this.camera.lookAt(0, 0, 0);
            const geom = new THREE.PlaneGeometry(500, 500, 50, 50);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.2 });
            this.plane = new THREE.Mesh(geom, mat); this.plane.rotation.x = -Math.PI / 2;
            this.scene.add(this.plane);
            let time = 0;
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                time += 0.03; const pos = this.plane.geometry.attributes.position.array;
                for(let i=0; i<pos.length; i+=3) {
                    const x = pos[i], y = pos[i+1];
                    pos[i+2] = Math.sin(x * 0.04 + time) * 12 + Math.cos(y * 0.04 + time) * 12;
                }
                this.plane.geometry.attributes.position.needsUpdate = true;
                this.renderer.render(this.scene, this.camera);
            };
            animate();
        }
        dispose() { super.dispose(); if (this.renderer) this.renderer.dispose(); }
    }

    ns.FX = {
        manager: new FXManager(),
        SolarisEffect,
        QuantumNeuralEffect,
        WavesEffect,
        TokamakEffect,
        MementoEffect,
        ArtEffect,
        RaymarchingEffect,
        AttractionEffect,
        AsciiEffect
    };

    ns.FX.manager.register('solaris', SolarisEffect);
    ns.FX.manager.register('neural', QuantumNeuralEffect);
    ns.FX.manager.register('waves', WavesEffect);
    ns.FX.manager.register('tokamak', TokamakEffect);
    ns.FX.manager.register('memento', MementoEffect);
    ns.FX.manager.register('art', ArtEffect);
    ns.FX.manager.register('raymarching', RaymarchingEffect);
    ns.FX.manager.register('attraction', AttractionEffect);
    ns.FX.manager.register('ascii', AsciiEffect);

})(window.EveConstellationMap);

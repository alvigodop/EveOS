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
        }
        init(container) {
            this.container = container;
            this.running = true;
        }
        dispose() {
            this.running = false;
            if (this.canvas && this.canvas.parentElement) {
                this.canvas.parentElement.removeChild(this.canvas);
            }
        }
    }

    /**
     * Solaris Effect (Sun/Star with Shaders)
     */
    class SolarisEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
            this.camera.position.set(0, 0, 100);

            const starGeometry = new THREE.IcosahedronGeometry(25, 10);
            const starMaterial = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xffaa00) } },
                vertexShader: `
                    varying vec3 vN;
                    uniform float time;
                    void main(){
                        vN = normalize(normal);
                        vec3 p = position + normal * sin(position.y * 0.2 + time) * 2.0;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec3 vN;
                    uniform float time;
                    uniform vec3 color;
                    void main(){
                        float fres = pow(1.0 - abs(dot(vN, vec3(0,0,1))), 3.0);
                        float pulse = 0.5 + 0.5 * sin(time * 2.0);
                        gl_FragColor = vec4(color * (0.5 + fres * 2.0) * (0.8 + pulse * 0.2), 0.4);
                    }
                `,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });
            this.star = new THREE.Mesh(starGeometry, starMaterial);
            this.scene.add(this.star);

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                starMaterial.uniforms.time.value += 0.01;
                this.star.rotation.y += 0.002;
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
     * Raymarching Effect (Shader-based)
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
            this.camera = new THREE.Camera(); // Orthographic for full screen shader

            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
                },
                vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    uniform float time;
                    uniform vec2 resolution;
                    
                    mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
                    
                    float map(vec3 p) {
                        p.xz *= rot(time * 0.3);
                        p.xy *= rot(time * 0.2);
                        return length(p) - 1.0 + sin(p.x * 5.0 + time) * 0.1;
                    }

                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.y, resolution.x);
                        vec3 ro = vec3(0, 0, -3);
                        vec3 rd = normalize(vec3(uv, 1.0));
                        float d = 0.0, t = 0.0;
                        for(int i=0; i<64; i++) {
                            d = map(ro + rd * t);
                            if(d < 0.001 || t > 10.0) break;
                            t += d;
                        }
                        vec3 col = vec3(0.0);
                        if(d < 0.001) col = vec3(0.1, 0.4, 0.8) * (1.0 - t/10.0);
                        gl_FragColor = vec4(col, 0.2);
                    }
                `,
                transparent: true, blending: THREE.AdditiveBlending
            });
            const quad = new THREE.Mesh(geometry, material);
            this.scene.add(quad);

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                material.uniforms.time.value += 0.01;
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
     * Quantum Neural Effect
     */
    class QuantumNeuralEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            
            const ctx = this.canvas.getContext('2d');
            const nodes = Array.from({length: 100}, () => ({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5
            }));

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.fillStyle = 'rgba(100, 200, 255, 0.2)';
                ctx.strokeStyle = 'rgba(100, 200, 255, 0.05)';
                
                nodes.forEach(n => {
                    n.x += n.vx; n.y += n.vy;
                    if(n.x < 0 || n.x > this.canvas.width) n.vx *= -1;
                    if(n.y < 0 || n.y > this.canvas.height) n.vy *= -1;
                    ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, Math.PI*2); ctx.fill();
                });

                for(let i=0; i<nodes.length; i++) {
                    for(let j=i+1; j<nodes.length; j++) {
                        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
                        if(dist < 150) {
                            ctx.beginPath();
                            ctx.moveTo(nodes[i].x, nodes[i].y);
                            ctx.lineTo(nodes[j].x, nodes[j].y);
                            ctx.stroke();
                        }
                    }
                }
            };
            animate();
        }
    }

    /**
     * Waves Effect
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
            this.camera.position.set(0, 50, 100);
            this.camera.lookAt(0, 0, 0);

            const geometry = new THREE.BufferGeometry();
            const count = 50 * 50;
            const positions = new Float32Array(count * 3);
            for(let i=0; i<count; i++) {
                const x = (i % 50) * 10 - 250;
                const z = Math.floor(i / 50) * 10 - 250;
                positions[i*3] = x;
                positions[i*3+1] = 0;
                positions[i*3+2] = z;
            }
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({ color: 0x00d4ff, size: 2, transparent: true, opacity: 0.4 });
            this.points = new THREE.Points(geometry, material);
            this.scene.add(this.points);

            let time = 0;
            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                time += 0.05;
                const pos = this.points.geometry.attributes.position.array;
                for(let i=0; i<count; i++) {
                    const x = pos[i*3];
                    const z = pos[i*3+2];
                    pos[i*3+1] = Math.sin(x * 0.05 + time) * 10 + Math.cos(z * 0.05 + time) * 10;
                }
                this.points.geometry.attributes.position.needsUpdate = true;
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
     * Tokamak Effect
     */
    class TokamakEffect extends BaseEffect {
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
            this.camera.position.set(0, 0, 100);

            const geo = new THREE.TorusGeometry(40, 10, 32, 100);
            const mat = new THREE.MeshBasicMaterial({ color: 0x0088ff, wireframe: true, transparent: true, opacity: 0.15 });
            this.mesh = new THREE.Mesh(geo, mat);
            this.scene.add(this.mesh);

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                this.mesh.rotation.x += 0.005;
                this.mesh.rotation.y += 0.01;
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
     * Memento Mori Effect
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
            
            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                const x = Math.random() * this.canvas.width;
                const y = Math.random() * this.canvas.height;
                ctx.moveTo(this.canvas.width/2, this.canvas.height/2);
                ctx.lineTo(x, y);
                ctx.stroke();
            };
            animate();
        }
    }

    /**
     * Art Effect
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
                requestAnimationFrame(animate);
                frame++;
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.strokeStyle = `rgba(0, 255, 255, 0.1)`;
                ctx.beginPath();
                for(let i=0; i<50; i++) {
                    const r = 200 + Math.sin(frame * 0.02 + i) * 100;
                    const a = i * 0.2 + frame * 0.01;
                    ctx.lineTo(this.canvas.width/2 + Math.cos(a) * r, this.canvas.height/2 + Math.sin(a) * r);
                }
                ctx.stroke();
            };
            animate();
        }
    }

    /**
     * Attraction Effect (Neon Trail)
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
            
            let mouse = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
            let history = [];

            const onMove = (e) => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
            };
            window.addEventListener('mousemove', onMove);
            this.cleanup = () => window.removeEventListener('mousemove', onMove);

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                
                history.push({ ...mouse });
                if(history.length > 20) history.shift();

                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                if(history.length < 2) return;

                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#00ffff';
                ctx.strokeStyle = '#00ffff';

                ctx.beginPath();
                ctx.moveTo(history[0].x, history[0].y);
                for(let i=1; i<history.length; i++) {
                    ctx.lineTo(history[i].x, history[i].y);
                }
                ctx.stroke();
            };
            animate();
        }
        dispose() {
            super.dispose();
            if(this.cleanup) this.cleanup();
        }
    }

    /**
     * ASCII Effect
     */
    class AsciiEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            this.div = document.createElement('div');
            this.div.className = 'map-fx-layer';
            this.div.style.fontFamily = 'monospace';
            this.div.style.fontSize = '10px';
            this.div.style.lineHeight = '8px';
            this.div.style.color = 'rgba(0, 255, 200, 0.3)';
            this.div.style.whiteSpace = 'pre';
            this.div.style.overflow = 'hidden';
            this.div.style.userSelect = 'none';
            container.prepend(this.div);

            const chars = '@#%*+=-:. ';
            const width = Math.floor(window.innerWidth / 8);
            const height = Math.floor(window.innerHeight / 8);

            const animate = () => {
                if (!this.running) return;
                requestAnimationFrame(animate);
                let text = '';
                const time = Date.now() * 0.001;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const noise = Math.sin(x * 0.1 + time) + Math.cos(y * 0.1 + time);
                        const idx = Math.floor(f(noise, -2, 2, 0, chars.length - 1));
                        text += chars[I(idx, 0, chars.length - 1)];
                    }
                    text += '\n';
                }
                this.div.textContent = text;
            };
            
            const f = (i, t, e, s, n) => s + (i - t) / (e - t) * (n - s);
            const I = (i, t, e) => Math.min(Math.max(i, t), e);

            animate();
        }
        dispose() {
            this.running = false;
            if (this.div && this.div.parentElement) {
                this.div.parentElement.removeChild(this.div);
            }
        }
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

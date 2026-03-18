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
            this.activeOverlays = new Map(); // Store togglable overlays
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
            
            // Background Engine
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

            // Overlays (Toggles)
            const handleOverlay = (id, enabled) => {
                const current = this.activeOverlays.get(id);
                if (enabled && !current) {
                    const EngineClass = this.engines.get(id);
                    if (EngineClass) {
                        const instance = new EngineClass();
                        instance.init(this.container);
                        this.activeOverlays.set(id, instance);
                    }
                } else if (!enabled && current) {
                    current.dispose();
                    this.activeOverlays.delete(id);
                }
            };

            handleOverlay('neuralhud', !!state.fxNeuralHudEnabled);

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
            this.activeOverlays.forEach(overlay => overlay.dispose());
            this.activeOverlays.clear();
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
            const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
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

            const nodeShader = {
                vertexShader: `${NOISE_GLSL}
                attribute float nodeSize;
                attribute float nodeType;
                attribute vec3 nodeColor;
                attribute float distanceFromRoot;
                uniform float uTime;
                uniform vec3 uPulsePositions[3];
                uniform float uPulseTimes[3];
                uniform float uPulseSpeed;
                uniform float uBaseNodeSize;
                varying vec3 vColor;
                varying float vNodeType;
                varying vec3 vPosition;
                varying float vPulseIntensity;
                varying float vDistanceFromRoot;
                varying float vGlow;
                float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
                    if (pulseTime < 0.0) return 0.0;
                    float timeSinceClick = uTime - pulseTime;
                    if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;
                    float pulseRadius = timeSinceClick * uPulseSpeed;
                    float distToClick = distance(worldPos, pulsePos);
                    float pulseThickness = 3.0;
                    float waveProximity = abs(distToClick - pulseRadius);
                    return smoothstep(pulseThickness, 0.0, waveProximity) * smoothstep(4.0, 0.0, timeSinceClick);
                }
                void main() {
                    vNodeType = nodeType; vColor = nodeColor; vDistanceFromRoot = distanceFromRoot;
                    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    vPosition = worldPos;
                    float totalPulseIntensity = 0.0;
                    for (int i = 0; i < 3; i++) { totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]); }
                    vPulseIntensity = min(totalPulseIntensity, 1.0);
                    float breathe = sin(uTime * 0.7 + distanceFromRoot * 0.15) * 0.15 + 0.85;
                    float baseSize = nodeSize * breathe;
                    float pulseSize = baseSize * (1.0 + vPulseIntensity * 2.5);
                    vGlow = 0.5 + 0.5 * sin(uTime * 0.5 + distanceFromRoot * 0.2);
                    vec3 modPos = position;
                    if (nodeType > 0.5) { modPos += normal * snoise(position * 0.08 + uTime * 0.08) * 0.15; }
                    vec4 mvPos = modelViewMatrix * vec4(modPos, 1.0);
                    gl_PointSize = pulseSize * uBaseNodeSize * (1000.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }`,
                fragmentShader: `
                uniform float uTime; uniform vec3 uPulseColors[3];
                varying vec3 vColor; varying float vNodeType; varying vec3 vPosition;
                varying float vPulseIntensity; varying float vDistanceFromRoot; varying float vGlow;
                void main() {
                    vec2 center = 2.0 * gl_PointCoord - 1.0;
                    float dist = length(center);
                    if (dist > 1.0) discard;
                    float glowStrength = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.2) + (1.0 - smoothstep(0.0, 1.0, dist)) * 0.3;
                    vec3 finalColor = vColor * (0.9 + 0.1 * sin(uTime * 0.6 + vDistanceFromRoot * 0.25));
                    if (vPulseIntensity > 0.0) {
                        finalColor = mix(finalColor, mix(vec3(1.0), uPulseColors[0], 0.4), vPulseIntensity * 0.8);
                        finalColor *= (1.0 + vPulseIntensity * 1.2);
                        glowStrength *= (1.0 + vPulseIntensity);
                    }
                    finalColor += vec3(1.0) * smoothstep(0.4, 0.0, dist) * 0.3;
                    float alpha = glowStrength * (0.95 - 0.3 * dist) * smoothstep(100.0, 15.0, length(vPosition - cameraPosition));
                    gl_FragColor = vec4(finalColor * (1.0 + vGlow * 0.1), alpha);
                }`
            };

            const connectionShader = {
                vertexShader: `${NOISE_GLSL}
                attribute vec3 startPoint; attribute vec3 endPoint; attribute float connectionStrength;
                attribute float pathIndex; attribute vec3 connectionColor;
                uniform float uTime; uniform vec3 uPulsePositions[3]; uniform float uPulseTimes[3]; uniform float uPulseSpeed;
                varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity;
                varying float vPathPosition; varying float vDistanceFromCamera;
                float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
                    if (pulseTime < 0.0) return 0.0;
                    float timeSinceClick = uTime - pulseTime;
                    if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;
                    float pulseRadius = timeSinceClick * uPulseSpeed;
                    float distToClick = distance(worldPos, pulsePos);
                    float waveProximity = abs(distToClick - pulseRadius);
                    return smoothstep(3.0, 0.0, waveProximity) * smoothstep(4.0, 0.0, timeSinceClick);
                }
                void main() {
                    float t = position.x; vPathPosition = t;
                    vec3 mid = mix(startPoint, endPoint, 0.5);
                    vec3 perp = normalize(cross(normalize(endPoint - startPoint), vec3(0, 1, 0)));
                    if (length(perp) < 0.1) perp = vec3(1, 0, 0);
                    mid += perp * sin(t * 3.14) * 0.15;
                    vec3 p0 = mix(startPoint, mid, t), p1 = mix(mid, endPoint, t), finalPos = mix(p0, p1, t);
                    finalPos += perp * snoise(vec3(pathIndex * 0.08, t * 0.6, uTime * 0.15)) * 0.12;
                    vec3 worldPos = (modelMatrix * vec4(finalPos, 1.0)).xyz;
                    float totalPulseIntensity = 0.0;
                    for (int i = 0; i < 3; i++) { totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]); }
                    vPulseIntensity = min(totalPulseIntensity, 1.0);
                    vColor = connectionColor; vConnectionStrength = connectionStrength;
                    vDistanceFromCamera = length(worldPos - cameraPosition);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
                }`,
                fragmentShader: `
                uniform float uTime; uniform vec3 uPulseColors[3];
                varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity;
                varying float vPathPosition; varying float vDistanceFromCamera;
                void main() {
                    float combinedFlow = (sin(vPathPosition * 25.0 - uTime * 4.0) * 0.5 + 0.5 + (sin(vPathPosition * 15.0 - uTime * 2.5 + 1.57) * 0.5 + 0.5) * 0.5) / 1.5;
                    vec3 baseColor = vColor * (0.8 + 0.2 * sin(uTime * 0.6 + vPathPosition * 12.0));
                    float flowIntensity = 0.4 * combinedFlow * vConnectionStrength;
                    vec3 finalColor = baseColor;
                    if (vPulseIntensity > 0.0) {
                        finalColor = mix(baseColor, mix(vec3(1.0), uPulseColors[0], 0.3) * 1.2, vPulseIntensity * 0.7);
                        flowIntensity += vPulseIntensity * 0.8;
                    }
                    finalColor *= (0.7 + flowIntensity + vConnectionStrength * 0.5);
                    float alpha = (0.7 * vConnectionStrength + combinedFlow * 0.3);
                    alpha = mix(alpha, min(1.0, alpha * 2.5), vPulseIntensity);
                    gl_FragColor = vec4(finalColor, alpha * smoothstep(100.0, 15.0, vDistanceFromCamera));
                }`
            };

            const createNetwork = (fIdx) => {
                const nodes = [];
                const addConn = (n1, n2, s) => { n1.cx.push({n: n2, s}); n2.cx.push({n: n1, s}); };
                const root = { id: 0, p: new THREE.Vector3(0,0,0), cx: [], lvl: 0, t: 0, sz: 2.0, dist: 0 };
                nodes.push(root);

                if (fIdx === 0) { // Sphere
                    const layers = 5, GR = (1 + Math.sqrt(5)) / 2;
                    for (let l = 1; l <= layers; l++) {
                        const r = l * 4, nP = Math.floor(l * 12);
                        for (let i = 0; i < nP; i++) {
                            const phi = Math.acos(1 - 2 * (i + 0.5) / nP), theta = 2 * Math.PI * i / GR;
                            const node = { id: nodes.length, p: new THREE.Vector3(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta), r*Math.cos(phi)), cx: [], lvl: l, t: (l===layers?1:0), sz: Math.random()*0.6+0.8, dist: r };
                            nodes.push(node);
                            if (l > 1) {
                                nodes.filter(n => n.lvl === l - 1 && n !== root).sort((a, b) => node.p.distanceTo(a.p) - node.p.distanceTo(b.p)).slice(0, 3).forEach(prev => addConn(node, prev, 1.0 - (node.p.distanceTo(prev.p)/(r*2))));
                            } else addConn(root, node, 0.9);
                        }
                    }
                } else if (fIdx === 1) { // Helix
                    for (let i = 0; i < 200; i++) {
                        const a = i * 0.3, y = (i - 100) * 0.2;
                        const r = 8 + Math.sin(i * 0.1) * 2;
                        const node = { id: nodes.length, p: new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)), cx: [], lvl: Math.floor(i/40), t: i%10===0?1:0, sz: 0.8, dist: Math.abs(y) };
                        nodes.push(node);
                        if (i > 0) addConn(node, nodes[nodes.length-2], 0.8);
                    }
                } else if (fIdx === 2) { // Fractal
                    const addBranch = (p, d, l, maxL) => {
                        if (l > maxL) return;
                        const node = { id: nodes.length, p: p.clone(), cx: [], lvl: l, t: l===maxL?1:0, sz: 1.5/l, dist: p.length() };
                        nodes.push(node);
                        for (let i = 0; i < 3; i++) {
                            const np = p.clone().add(new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(d));
                            const child = addBranch(np, d * 0.7, l + 1, maxL);
                            if (child) addConn(node, child, 0.9);
                        }
                        return node;
                    };
                    addBranch(new THREE.Vector3(0,0,0), 10, 1, 4);
                }
                return nodes;
            };

            const fnodes = createNetwork(0);
            const nodesGeom = new THREE.BufferGeometry();
            const pos = [], type = [], size = [], colors = [], dists = [];
            const palette = this.colorPalettes[0];

            fnodes.forEach(n => {
                pos.push(n.p.x, n.p.y, n.p.z); type.push(n.t); size.push(n.sz); dists.push(n.dist);
                const c = palette[n.lvl % palette.length].clone().offsetHSL(Math.random()*0.06-0.03, Math.random()*0.16-0.08, Math.random()*0.16-0.08);
                colors.push(c.r, c.g, c.b);
            });
            nodesGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            nodesGeom.setAttribute('nodeType', new THREE.Float32BufferAttribute(type, 1));
            nodesGeom.setAttribute('nodeSize', new THREE.Float32BufferAttribute(size, 1));
            nodesGeom.setAttribute('nodeColor', new THREE.Float32BufferAttribute(colors, 3));
            nodesGeom.setAttribute('distanceFromRoot', new THREE.Float32BufferAttribute(dists, 1));

            this.nodesMesh = new THREE.Points(nodesGeom, new THREE.ShaderMaterial({ uniforms: this.pulseUniforms, vertexShader: nodeShader.vertexShader, fragmentShader: nodeShader.fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            this.scene.add(this.nodesMesh);

            // Connections (Neural Pathways)
            const connections = [];
            fnodes.forEach(n => n.cx.forEach(c => {
                if (n.id < c.n.id || !c.n.id) { // Avoid duplicates
                    connections.push({ s: n.p, e: c.n.p, st: c.s, c: palette[n.lvl % palette.length] });
                }
            }));

            const connGeom = new THREE.InstancedBufferGeometry();
            // Base geometry for a single segment (a plane or a line with segments)
            const segmentRes = 20;
            const basePos = [];
            for (let i = 0; i <= segmentRes; i++) { basePos.push(i / segmentRes, 0, 0); }
            connGeom.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3));

            const startPoints = [], endPoints = [], strengths = [], indices = [], connColors = [];
            connections.forEach((conn, i) => {
                startPoints.push(conn.s.x, conn.s.y, conn.s.z);
                endPoints.push(conn.e.x, conn.e.y, conn.e.z);
                strengths.push(conn.st);
                indices.push(i);
                connColors.push(conn.c.r, conn.c.g, conn.c.b);
            });

            connGeom.setAttribute('startPoint', new THREE.InstancedBufferAttribute(new Float32Array(startPoints), 3));
            connGeom.setAttribute('endPoint', new THREE.InstancedBufferAttribute(new Float32Array(endPoints), 3));
            connGeom.setAttribute('connectionStrength', new THREE.InstancedBufferAttribute(new Float32Array(strengths), 1));
            connGeom.setAttribute('pathIndex', new THREE.InstancedBufferAttribute(new Float32Array(indices), 1));
            connGeom.setAttribute('connectionColor', new THREE.InstancedBufferAttribute(new Float32Array(connColors), 3));

            const connMat = new THREE.ShaderMaterial({
                uniforms: { ...this.pulseUniforms, connectionColor: { value: new THREE.Color(0x00d4ff) } },
                vertexShader: connectionShader.vertexShader,
                fragmentShader: connectionShader.fragmentShader,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
            });
            this.connectionsMesh = new THREE.Line(connGeom, connMat);
            this.scene.add(this.connectionsMesh);

            this.onMapClick = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
                const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, this.camera);
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

    /**
     * Blurred Loader Effect (CSS Glassmorphism)
     */
    /**
     * High-Fidelity Blurred Loader Effect
     */
    class BlurredLoaderEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.div = document.createElement('div');
            this.div.className = 'map-fx-layer fx-blurred-loader';
            this.div.innerHTML = `
                <div class="glass-bg">
                    <div class="orbit-container">
                        <div class="blob blob-1"></div>
                        <div class="blob blob-2"></div>
                        <div class="blob blob-3"></div>
                    </div>
                </div>
            `;
            container.prepend(this.div);
        }
    }

    /**
     * High-Fidelity Dramatic SVG Filters Effect
     */
    class SVGFiltersEffect extends BaseEffect {
        init(container) {
            super.init(container);
            // Inject SVG Filters if not present
            if (!document.getElementById('fx-svg-defs')) {
                const svgNS = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(svgNS, "svg");
                svg.id = 'fx-svg-defs';
                svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
                svg.innerHTML = `
                    <defs>
                        <filter id="🌀🎨" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" result="noise" seed="1" />
                            <feDisplacementMap in="SourceGraphic" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                        <filter id="🌀↖️" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="turbulence" />
                            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="20" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                    </defs>
                `;
                document.body.appendChild(svg);
            }

            this.el = document.createElement('div');
            this.el.className = 'map-fx-layer fx-svg-dramatic';
            this.el.innerHTML = `
                <div class="glass-wall">
                    ${Array(6).fill('<div class="glass-card"><div class="card-glow"></div></div>').join('')}
                </div>
            `;
            container.prepend(this.el);
        }
        dispose() {
            super.dispose();
            if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
        }
    }

    /**
     * Lines and Dots Effect (Canvas Particles)
     */
    /**
     * High-Fidelity Lines and Dots Effect (Canvas Particles)
     */
    class LinesDotsEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            const ctx = this.canvas.getContext('2d');
            
            this.particles = Array.from({length: 120}, () => ({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 1.2,
                vy: (Math.random() - 0.5) * 1.2,
                size: Math.random() * 2 + 1,
                color: `hsla(${190 + Math.random() * 40}, 100%, 70%, 0.6)`
            }));

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                this.particles.forEach((p, i) => {
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
                    if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();

                    for (let j = i + 1; j < this.particles.length; j++) {
                        const p2 = this.particles[j];
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 150) {
                            const alpha = (1 - dist / 150) * 0.2;
                            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.stroke();
                        }
                    }
                });
            };
            animate();
        }
        dispose() {
            super.dispose();
            if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
        }
    }

    /**
     * Fragment Shader Editor Effect (WebGL Shader)
     */
    class FragmentShaderEditorEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.renderer = new THREE.WebGLRenderer({ alpha: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.Camera();

            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
                },
                vertexShader: `void main(){ gl_Position=vec4(position,1.0); }`,
                fragmentShader: `
                    precision highp float;
                    uniform float time;
                    uniform vec2 resolution;
                    void main(){
                        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
                        float d = length(uv);
                        vec3 col = vec3(0.1, 0.4, 0.8) * (0.5 / d);
                        col *= sin(d * 10.0 - time * 3.0);
                        gl_FragColor = vec4(col, 0.3);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending
            });
            this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                mat.uniforms.time.value += 0.02;
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
     * Dot Wave Effect (Three.js Enhanced)
     */
    class DotWaveEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 50, 150);
            this.camera.lookAt(0, 0, 0);

            const amountX = 50, amountY = 50, separation = 15;
            const count = amountX * amountY;
            const positions = new Float32Array(count * 3);
            const scales = new Float32Array(count);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

            const material = new THREE.ShaderMaterial({
                uniforms: { color: { value: new THREE.Color(0x00d4ff) } },
                vertexShader: `
                    attribute float scale;
                    void main() {
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = scale * (300.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform vec3 color;
                    void main() {
                        if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) discard;
                        gl_FragColor = vec4(color, 0.82);
                    }
                `,
                transparent: true
            });

            this.points = new THREE.Points(geometry, material);
            this.scene.add(this.points);

            let countIter = 0;
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const positions = this.points.geometry.attributes.position.array;
                const scales = this.points.geometry.attributes.scale.array;

                let i = 0, j = 0;
                for (let ix = 0; ix < amountX; ix++) {
                    for (let iy = 0; iy < amountY; iy++) {
                        positions[i + 1] = (Math.sin((ix + countIter) * 0.3) * 20) + (Math.sin((iy + countIter) * 0.5) * 20);
                        scales[j] = (Math.sin((ix + countIter) * 0.3) + 1) * 4 + (Math.sin((iy + countIter) * 0.5) + 1) * 4;
                        i += 3; j++;
                    }
                }
                this.points.geometry.attributes.position.needsUpdate = true;
                this.points.geometry.attributes.scale.needsUpdate = true;
                this.renderer.render(this.scene, this.camera);
                countIter += 0.08;
            };
            animate();
        }
        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    ns.FX.manager.register('blurred', BlurredLoaderEffect);
    ns.FX.manager.register('svgfilters', SVGFiltersEffect);
    ns.FX.manager.register('particles', LinesDotsEffect);
    ns.FX.manager.register('shaderedit', FragmentShaderEditorEffect);
    ns.FX.manager.register('dotwave', DotWaveEffect);

    /**
     * Cosmic Sun Effect (GLSL)
     */
    class CosmicSunEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            container.prepend(this.canvas);
            this.gl = this.canvas.getContext('webgl');
            if (!this.gl) return;

            this.resize = () => {
                const d = window.devicePixelRatio || 1;
                this.canvas.width = window.innerWidth * d;
                this.canvas.height = window.innerHeight * d;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            };
            window.addEventListener('resize', this.resize);
            this.resize();

            const vert = `attribute vec2 pos; void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;
            const frag = `
                precision highp float;
                uniform vec2 u_res;
                uniform float u_time;
                void main() {
                    vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
                    vec3 c = vec3(0.0);
                    for (float i = 0.0; i < 40.0; i++) {
                        float a = i / 1.5 + u_time * 0.2;
                        vec2 q = p;
                        q.x += sin(q.y * 10.0 + u_time + i) * 0.1;
                        float d = length(q - vec2(cos(a), sin(a)) * 0.5);
                        c += vec3(0.3, 0.2, 0.1) * (0.01 / d);
                    }
                    gl_FragColor = vec4(c * c + 0.05, 1.0);
                }
            `;

            const compile = (src, type) => {
                const s = this.gl.createShader(type);
                this.gl.shaderSource(s, src);
                this.gl.compileShader(s);
                return s;
            };
            
            const vs = compile(vert, this.gl.VERTEX_SHADER);
            const fs = compile(frag, this.gl.FRAGMENT_SHADER);
            this.program = this.gl.createProgram();
            this.gl.attachShader(this.program, vs);
            this.gl.attachShader(this.program, fs);
            this.gl.linkProgram(this.program);
            this.gl.useProgram(this.program);

            this.buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), this.gl.STATIC_DRAW);
            this.gl.enableVertexAttribArray(0);
            this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const t = Date.now() * 0.001;
                this.gl.uniform2f(this.gl.getUniformLocation(this.program, "u_res"), this.canvas.width, this.canvas.height);
                this.gl.uniform1f(this.gl.getUniformLocation(this.program, "u_time"), t);
                this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
            };
            animate();
        }
        dispose() {
            super.dispose();
            window.removeEventListener('resize', this.resize);
            if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
        }
    }

    /**
     * Aura Cursor Effect (Canvas Particles)
     */
    class AuraCursorEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer';
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            container.prepend(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            
            this.particles = Array.from({length: 50}, () => ({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: Math.random() * 3 + 1
            }));
            
            this.mouse = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
            this.onMouseMove = (e) => {
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            };
            window.addEventListener('mousemove', this.onMouseMove);

            this.resize = () => {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            };
            window.addEventListener('resize', this.resize);

            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
                
                this.particles.forEach(p => {
                    const dx = this.mouse.x - p.x;
                    const dy = this.mouse.y - p.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 250) {
                        p.vx += dx * 0.0005;
                        p.vy += dy * 0.0005;
                    }
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vx *= 0.98;
                    p.vy *= 0.98;

                    if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
                    if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    this.ctx.fill();
                });
            };
            animate();
        }
        dispose() {
            super.dispose();
            window.removeEventListener('mousemove', this.onMouseMove);
            window.removeEventListener('resize', this.resize);
            if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
        }
    }

    /**
     * Neural Nexus HUD (Overlay Effect)
     */
    class NeuralNexusHUD extends BaseEffect {
        init(container) {
            super.init(container);
            this.el = document.createElement('div');
            this.el.className = 'map-fx-layer fx-hud-layer';
            this.el.innerHTML = `
                <div class="hud-frame">
                    <div class="hud-corner tl"></div>
                    <div class="hud-corner tr"></div>
                    <div class="hud-corner bl"></div>
                    <div class="hud-corner br"></div>
                    <div class="hud-scanline"></div>
                </div>
            `;
            container.appendChild(this.el);
        }
        dispose() {
            super.dispose();
            if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
        }
    }

    ns.FX.manager.register('cosmicsun', CosmicSunEffect);
    ns.FX.manager.register('auracursor', AuraCursorEffect);
    ns.FX.manager.register('neuralhud', NeuralNexusHUD);

})(window.EveConstellationMap);

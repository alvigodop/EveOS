window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

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

    const fxWebGlQuantum = ns._fxWebGlQuantum = ns._fxWebGlQuantum || {};

    Object.assign(fxWebGlQuantum, {
        QuantumNeuralEffect
    });

})(window.EveConstellationMap);

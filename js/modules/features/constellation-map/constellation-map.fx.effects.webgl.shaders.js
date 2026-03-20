window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

    class RaymarchingEffect extends BaseEffect {
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
            this.camera = new THREE.Camera();
            this.bindPointer(this.canvas);
            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    pointer: { value: new THREE.Vector2(0.5, 0.5) },
                    glow: { value: 1 }
                },
                vertexShader: 'void main(){ gl_Position=vec4(position,1.0); }',
                fragmentShader: `
                    precision highp float;
                    uniform float time;
                    uniform vec2 resolution;
                    uniform vec2 pointer;
                    uniform float glow;
                    #define rot(a) mat2(cos(a),-sin(a),sin(a),cos(a))
                    float map(vec3 p){
                        p.xz*=rot(time*0.3 + (pointer.x - 0.5) * 1.2);
                        p.xy*=rot(time*0.2 + (pointer.y - 0.5) * 1.0);
                        vec3 q=abs(p)-1.0;
                        return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-0.1;
                    }
                    void main(){
                        vec2 uv=(gl_FragCoord.xy-0.5*resolution.xy)/min(resolution.y,resolution.x);
                        vec3 ro=vec3(0,0,-4), rd=normalize(vec3(uv,1.5));
                        float t=0.0;
                        for(int i=0; i<80; i++){ float d=map(ro+rd*t); if(d<0.001||t>10.0) break; t+=d; }
                        vec3 col=vec3(0.0);
                        if(t<10.0){
                            vec3 n=normalize(vec3(map(ro+rd*t+vec3(0.01,0,0))-map(ro+rd*t-vec3(0.01,0,0)), map(ro+rd*t+vec3(0,0.01,0))-map(ro+rd*t-vec3(0,0.01,0)), map(ro+rd*t+vec3(0,0,0.01))-map(ro+rd*t-vec3(0,0,0.01))));
                            float light = max(0.0, dot(n, normalize(vec3(1.0, 2.0, -1.0))));
                            col=vec3(0.18,0.62,1.0)*light*(1.0-t/10.0) * (0.7 + glow * 0.4);
                        }
                        gl_FragColor=vec4(col,0.34 + glow * 0.08);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending
            });
            this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.material.uniforms.time.value = time * this.getFxValue('speed');
                this.material.uniforms.pointer.value.set(this.pointer.x, this.pointer.y);
                this.material.uniforms.glow.value = this.getFxValue('glow');
                this.renderer.render(this.scene, this.camera);
            };
            animate();
        }

        resize() {
            if (!this.renderer || !this.material) return;
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(this.width, this.height);
            this.material.uniforms.resolution.value.set(this.width, this.height);
        }

        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    class FragmentShaderEditorEffect extends BaseEffect {
        async init(container) {
            super.init(container);
            const THREE = await import('three');
            this.THREE = THREE;
            this.renderer = new THREE.WebGLRenderer({ alpha: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.canvas = this.renderer.domElement;
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.scene = new THREE.Scene();
            this.camera = new THREE.Camera();
            this.bindPointer(this.canvas);
            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    pointer: { value: new THREE.Vector2(0.5, 0.5) },
                    glow: { value: 1 }
                },
                vertexShader: 'void main(){ gl_Position=vec4(position,1.0); }',
                fragmentShader: `
                    precision highp float;
                    uniform float time;
                    uniform vec2 resolution;
                    uniform vec2 pointer;
                    uniform float glow;
                    void main(){
                        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
                        vec2 p = uv + vec2((pointer.x - 0.5) * 0.4, (pointer.y - 0.5) * 0.4);
                        float d = length(p);
                        float rings = sin(d * 12.0 - time * 3.6) * 0.5 + 0.5;
                        float spokes = sin(atan(p.y, p.x) * 8.0 + time * 1.8) * 0.5 + 0.5;
                        vec3 col = mix(vec3(0.08, 0.42, 0.9), vec3(0.42, 0.95, 1.0), spokes) * rings * (0.7 + glow * 0.4);
                        gl_FragColor = vec4(col * smoothstep(1.2, 0.05, d), 0.32 + glow * 0.1);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending
            });
            this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
            this.onResize = () => this.resize();
            window.addEventListener('resize', this.onResize);
            this.addCleanup(() => window.removeEventListener('resize', this.onResize));
            this.resize();
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001;
                this.updatePointerIdle(time);
                this.material.uniforms.time.value = time * this.getFxValue('speed');
                this.material.uniforms.pointer.value.set(this.pointer.x, this.pointer.y);
                this.material.uniforms.glow.value = this.getFxValue('glow');
                this.renderer.render(this.scene, this.camera);
            };
            animate();
        }

        resize() {
            if (!this.renderer || !this.material) return;
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(this.width, this.height);
            this.material.uniforms.resolution.value.set(this.width, this.height);
        }

        dispose() {
            super.dispose();
            if (this.renderer) this.renderer.dispose();
        }
    }

    class CosmicSunEffect extends BaseEffect {
        init(container) {
            super.init(container);
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'map-fx-layer map-engine-layer';
            container.prepend(this.canvas);
            this.gl = this.canvas.getContext('webgl');
            if (!this.gl) return;
            this.bindPointer(this.canvas);
            this.resize = () => {
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                this.canvas.width = Math.floor(this.width * dpr);
                this.canvas.height = Math.floor(this.height * dpr);
                this.canvas.style.width = this.width + 'px';
                this.canvas.style.height = this.height + 'px';
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            };
            window.addEventListener('resize', this.resize);
            this.addCleanup(() => window.removeEventListener('resize', this.resize));
            this.resize();
            const vert = 'attribute vec2 pos; void main() { gl_Position = vec4(pos, 0.0, 1.0); }';
            const frag = `
                precision highp float;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec2 u_pointer;
                uniform float u_glow;
                void main() {
                    vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
                    p += vec2((u_pointer.x - 0.5) * 0.5, (u_pointer.y - 0.5) * 0.35);
                    vec3 c = vec3(0.0);
                    for (float i = 0.0; i < 40.0; i++) {
                        float a = i / 1.5 + u_time * 0.2;
                        vec2 q = p;
                        q.x += sin(q.y * 10.0 + u_time + i) * 0.1;
                        float d = length(q - vec2(cos(a), sin(a)) * 0.5);
                        c += vec3(0.34, 0.26, 0.12) * ((0.01 + u_glow * 0.004) / d);
                    }
                    gl_FragColor = vec4(c * c + 0.05, 1.0);
                }
            `;
            const compile = (src, type) => {
                const shader = this.gl.createShader(type);
                this.gl.shaderSource(shader, src);
                this.gl.compileShader(shader);
                return shader;
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
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), this.gl.STATIC_DRAW);
            const positionLoc = this.gl.getAttribLocation(this.program, 'pos');
            this.gl.enableVertexAttribArray(positionLoc);
            this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
            this.uniforms = {
                res: this.gl.getUniformLocation(this.program, 'u_res'),
                time: this.gl.getUniformLocation(this.program, 'u_time'),
                pointer: this.gl.getUniformLocation(this.program, 'u_pointer'),
                glow: this.gl.getUniformLocation(this.program, 'u_glow')
            };
            const animate = () => {
                if (!this.running) return;
                this.animationFrame = requestAnimationFrame(animate);
                const time = performance.now() * 0.001 * this.getFxValue('speed');
                this.updatePointerIdle(time);
                this.gl.uniform2f(this.uniforms.res, this.canvas.width, this.canvas.height);
                this.gl.uniform1f(this.uniforms.time, time);
                this.gl.uniform2f(this.uniforms.pointer, this.pointer.x, this.pointer.y);
                this.gl.uniform1f(this.uniforms.glow, this.getFxValue('glow'));
                this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
            };
            animate();
        }
    }

    const fxWebGlShaders = ns._fxWebGlShaders = ns._fxWebGlShaders || {};
    Object.assign(fxWebGlShaders, {
        RaymarchingEffect,
        FragmentShaderEditorEffect,
        CosmicSunEffect
    });
})(window.EveConstellationMap);

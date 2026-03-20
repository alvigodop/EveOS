window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

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

    const fxWebGlShaders = ns._fxWebGlShaders = ns._fxWebGlShaders || {};

    Object.assign(fxWebGlShaders, {
        RaymarchingEffect,
        FragmentShaderEditorEffect,
        CosmicSunEffect
    });

})(window.EveConstellationMap);

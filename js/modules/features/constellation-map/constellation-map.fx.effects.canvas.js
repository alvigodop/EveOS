window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect, NOISE_GLSL } = fxBase;

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

    const fxCanvas = ns._fxCanvas = ns._fxCanvas || {};

    Object.assign(fxCanvas, {
        MementoEffect,
        AttractionEffect,
        ArtEffect,
        AsciiEffect,
        WavesEffect,
        LinesDotsEffect,
        DotWaveEffect,
        AuraCursorEffect
    });

})(window.EveConstellationMap);

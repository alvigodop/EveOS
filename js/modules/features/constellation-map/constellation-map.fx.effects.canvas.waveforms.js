window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxBase = ns._fxBase || {};
    const { BaseEffect } = fxBase;

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

    const fxCanvasWaveforms = ns._fxCanvasWaveforms = ns._fxCanvasWaveforms || {};
    Object.assign(fxCanvasWaveforms, {
        WavesEffect,
        DotWaveEffect
    });
})(window.EveConstellationMap);

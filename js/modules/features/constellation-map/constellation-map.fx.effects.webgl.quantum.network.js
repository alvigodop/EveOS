window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxWebGlQuantumNetwork = ns._fxWebGlQuantumNetwork = ns._fxWebGlQuantumNetwork || {};

function createQuantumNetwork(THREE, fIdx) {

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

    Object.assign(fxWebGlQuantumNetwork, {
        createQuantumNetwork
    });
})(window.EveConstellationMap);

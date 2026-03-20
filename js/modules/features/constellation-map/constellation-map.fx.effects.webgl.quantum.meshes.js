window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxWebGlQuantumMeshes = ns._fxWebGlQuantumMeshes = ns._fxWebGlQuantumMeshes || {};

    function buildQuantumMeshes(THREE, nodes, palette, pulseUniforms, nodeShader, connectionShader) {
        const nodesGeometry = new THREE.BufferGeometry();
        const positions = [];
        const nodeTypes = [];
        const nodeSizes = [];
        const nodeColors = [];
        const nodeDistances = [];

        nodes.forEach((node) => {
            positions.push(node.p.x, node.p.y, node.p.z);
            nodeTypes.push(node.t);
            nodeSizes.push(node.sz);
            nodeDistances.push(node.dist);
            const color = palette[node.lvl % palette.length]
                .clone()
                .offsetHSL(Math.random() * 0.06 - 0.03, Math.random() * 0.16 - 0.08, Math.random() * 0.16 - 0.08);
            nodeColors.push(color.r, color.g, color.b);
        });

        nodesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        nodesGeometry.setAttribute('nodeType', new THREE.Float32BufferAttribute(nodeTypes, 1));
        nodesGeometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(nodeSizes, 1));
        nodesGeometry.setAttribute('nodeColor', new THREE.Float32BufferAttribute(nodeColors, 3));
        nodesGeometry.setAttribute('distanceFromRoot', new THREE.Float32BufferAttribute(nodeDistances, 1));

        const nodesMesh = new THREE.Points(
            nodesGeometry,
            new THREE.ShaderMaterial({
                uniforms: pulseUniforms,
                vertexShader: nodeShader.vertexShader,
                fragmentShader: nodeShader.fragmentShader,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );

        const connections = [];
        nodes.forEach((node) => node.cx.forEach((connection) => {
            if (node.id < connection.n.id || !connection.n.id) {
                connections.push({
                    s: node.p,
                    e: connection.n.p,
                    st: connection.s,
                    c: palette[node.lvl % palette.length]
                });
            }
        }));

        const connectionGeometry = new THREE.InstancedBufferGeometry();
        const segmentResolution = 20;
        const basePositions = [];
        for (let i = 0; i <= segmentResolution; i++) {
            basePositions.push(i / segmentResolution, 0, 0);
        }
        connectionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(basePositions, 3));

        const startPoints = [];
        const endPoints = [];
        const strengths = [];
        const indices = [];
        const colors = [];
        connections.forEach((connection, i) => {
            startPoints.push(connection.s.x, connection.s.y, connection.s.z);
            endPoints.push(connection.e.x, connection.e.y, connection.e.z);
            strengths.push(connection.st);
            indices.push(i);
            colors.push(connection.c.r, connection.c.g, connection.c.b);
        });

        connectionGeometry.setAttribute('startPoint', new THREE.InstancedBufferAttribute(new Float32Array(startPoints), 3));
        connectionGeometry.setAttribute('endPoint', new THREE.InstancedBufferAttribute(new Float32Array(endPoints), 3));
        connectionGeometry.setAttribute('connectionStrength', new THREE.InstancedBufferAttribute(new Float32Array(strengths), 1));
        connectionGeometry.setAttribute('pathIndex', new THREE.InstancedBufferAttribute(new Float32Array(indices), 1));
        connectionGeometry.setAttribute('connectionColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));

        const connectionsMesh = new THREE.Line(
            connectionGeometry,
            new THREE.ShaderMaterial({
                uniforms: { ...pulseUniforms, connectionColor: { value: new THREE.Color(0x00d4ff) } },
                vertexShader: connectionShader.vertexShader,
                fragmentShader: connectionShader.fragmentShader,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );

        return {
            nodesMesh,
            connectionsMesh
        };
    }

    Object.assign(fxWebGlQuantumMeshes, {
        buildQuantumMeshes
    });
})(window.EveConstellationMap);

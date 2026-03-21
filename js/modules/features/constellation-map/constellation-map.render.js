window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {



    const shared = ns._shared || {};

    const {

        state,

        getStaticStateForNode,

        text

    } = shared;



    const renderCanvas = ns._renderCanvas || {};

    const {

        getNodeAnchor,

        getScreenPoint,

        renderLabels,

        drawPhysicsAuras

    } = renderCanvas;



    const renderToolbarHelpers = ns._renderToolbarHelpers || {};

    const {

        renderToolbarState,

        renderHeader

    } = renderToolbarHelpers;



    const renderInspectorHelpers = ns._renderInspectorHelpers || {};

    const {

        renderInspector,

        updateInspectorCoverState,

        updateCursor

    } = renderInspectorHelpers;



function requestDraw() {



        if (!state.running) draw();



    }





function draw() {



        if (!state.ctx || !state.canvas) return;



        const ctx = state.ctx;



        ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);



        ctx.save();



        ctx.translate(state.transform.tx, state.transform.ty);



        ctx.scale(state.transform.scale, state.transform.scale);



        drawPhysicsAuras(ctx);







        state.edges.forEach((edge) => {



            ctx.beginPath();



            ctx.moveTo(edge.source.x, edge.source.y);



            ctx.lineTo(edge.target.x, edge.target.y);



            ctx.strokeStyle = edge.type === 'tag' ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 212, 255, 0.28)';



            ctx.lineWidth = edge.type === 'tag' ? (0.9 / state.transform.scale) : (1.5 / state.transform.scale);



            ctx.stroke();



        });







        const rewireSourceNode = text(state.rewire?.sourceNodeId, '')
            ? state.nodes.find((node) => node.id === state.rewire.sourceNodeId) || null
            : null;
        const rewireTargetNode = text(state.rewire?.targetNodeId, '')
            ? state.nodes.find((node) => node.id === state.rewire.targetNodeId) || null
            : null;
        const validRewireTargets = state.rewire?.validTargetIds instanceof Set
            ? state.rewire.validTargetIds
            : new Set();

        if (state.rewire?.enabled && rewireSourceNode) {
            ctx.save();

            state.nodes.forEach((node) => {
                if (!validRewireTargets.has(String(node.id || ''))) return;
                const isActiveTarget = !!rewireTargetNode && rewireTargetNode.id === node.id;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (isActiveTarget ? 7.6 : 5.4), 0, Math.PI * 2);
                ctx.strokeStyle = isActiveTarget ? 'rgba(122,255,196,0.92)' : 'rgba(158,219,255,0.34)';
                ctx.lineWidth = (isActiveTarget ? 2.2 : 1.15) / state.transform.scale;
                if (!isActiveTarget) {
                    ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            });

            ctx.beginPath();
            ctx.arc(rewireSourceNode.x, rewireSourceNode.y, rewireSourceNode.radius + 6.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(145,220,255,0.94)';
            ctx.lineWidth = 2.1 / state.transform.scale;
            ctx.stroke();

            if (state.rewire.dragging) {
                const endX = rewireTargetNode ? rewireTargetNode.x : (Number(state.rewire.previewWorldX) || rewireSourceNode.x);
                const endY = rewireTargetNode ? rewireTargetNode.y : (Number(state.rewire.previewWorldY) || rewireSourceNode.y);
                ctx.beginPath();
                ctx.moveTo(Number(state.rewire.sourceStartX) || rewireSourceNode.x, Number(state.rewire.sourceStartY) || rewireSourceNode.y);
                ctx.lineTo(endX, endY);
                ctx.setLineDash([8 / state.transform.scale, 6 / state.transform.scale]);
                ctx.strokeStyle = rewireTargetNode ? 'rgba(122,255,196,0.88)' : 'rgba(145,220,255,0.72)';
                ctx.lineWidth = 1.8 / state.transform.scale;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        }

        state.nodes.forEach((node) => {

            const isHovered = state.hovered && state.hovered.id === node.id;

            const isSelected = state.selected && state.selected.id === node.id;

            ctx.beginPath();

            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

            ctx.fillStyle = node.color;

            ctx.shadowBlur = (isHovered || isSelected ? 20 : 10) / state.transform.scale;

            ctx.shadowColor = node.color;

            ctx.fill();

            ctx.shadowBlur = 0;



            if (node.kind === 'folder' && node.data && typeof node.data.depth === 'number' && node.data.depth > 0) {

                const maxRings = Math.min(node.data.depth, 4);

                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));

                for (let i = 1; i <= maxRings; i++) {

                    const ringRadius = node.radius - (gap * i);

                    if (ringRadius > 0.5) {

                        ctx.beginPath();

                        ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);

                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';

                        ctx.lineWidth = 1 / state.transform.scale;

                        ctx.stroke();

                    }

                }

            }



            if (isHovered || isSelected) {

                ctx.lineWidth = 2 / state.transform.scale;

                ctx.strokeStyle = 'rgba(255,255,255,0.92)';

                if (getStaticStateForNode(node).isStatic) {

                    ctx.strokeStyle = 'rgba(255,214,90,0.98)';

                }

                ctx.stroke();

            }



            if (getStaticStateForNode(node).isStatic) {



                ctx.beginPath();



                ctx.arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);



                ctx.lineWidth = 1.6 / state.transform.scale;



                ctx.strokeStyle = 'rgba(255,214,90,0.74)';



                ctx.stroke();



            }



        });







        ctx.restore();



        renderLabels(ctx);



        updateCursor();



    }





    state.renderInspector = renderInspector;



    ns._render = ns._render || {};



    Object.assign(ns._render, {

        requestDraw,

        renderHeader,

        renderInspector,

        renderToolbarState,

        updateInspectorCoverState,

        updateCursor,

        getScreenPoint,

        getNodeAnchor,

        draw

    });



})(window.EveConstellationMap);

window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getPairwiseInfluenceScale } = physicsHelpers;

    
    const nodePool = [];
    let poolIndex = 0;

    function getQuadNode(x, y, size) {
        if (poolIndex < nodePool.length) {
            const node = nodePool[poolIndex++];
            node.x = x;
            node.y = y;
            node.size = size;
            node.items = null;
            node.children = null;
            node.cx = 0;
            node.cy = 0;
            node.mass = 0;
            node.polarity = 0;
            return node;
        }
        const node = new QuadTreeNode(x, y, size);
        nodePool.push(node);
        poolIndex++;
        return node;
    }

    class QuadTreeNode {
        constructor(x, y, size) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.items = null; // Store indices here
            this.children = null;
            this.cx = 0;
            this.cy = 0;
            this.mass = 0;
            this.polarity = 0;
        }

        insert(nodeIndex, nodeX, nodeY) {
            if (this.children) {
                const right = nodeX >= this.x + this.size / 2;
                const bottom = nodeY >= this.y + this.size / 2;
                const index = (bottom ? 2 : 0) + (right ? 1 : 0);
                this.children[index].insert(nodeIndex, nodeX, nodeY);
                return;
            }
            if (!this.items) this.items = [];
            this.items.push(nodeIndex);

            if (this.items.length > 4 && this.size > 20) {
                this.children = [
                    getQuadNode(this.x, this.y, this.size / 2),
                    getQuadNode(this.x + this.size / 2, this.y, this.size / 2),
                    getQuadNode(this.x, this.y + this.size / 2, this.size / 2),
                    getQuadNode(this.x + this.size / 2, this.y + this.size / 2, this.size / 2)
                ];
                for (let i = 0; i < this.items.length; i++) {
                    const idx = this.items[i];
                    const itNode = state.nodes[idx];
                    const right = itNode.x >= this.x + this.size / 2;
                    const bottom = itNode.y >= this.y + this.size / 2;
                    const cIdx = (bottom ? 2 : 0) + (right ? 1 : 0);
                    this.children[cIdx].insert(idx, itNode.x, itNode.y);
                }
                this.items = null;
            }
        }
        computeMass(polarityDirections, polarityStrengths) {
            this.cx = 0; this.cy = 0; this.mass = 0; this.polarity = 0;
            if (this.children) {
                for (let i = 0; i < 4; i++) {
                    const c = this.children[i];
                    c.computeMass(polarityDirections, polarityStrengths);
                    if (c.mass > 0) {
                        this.cx += c.cx * c.mass;
                        this.cy += c.cy * c.mass;
                        this.mass += c.mass;
                        this.polarity += c.polarity;
                    }
                }
            } else if (this.items) {
                for (let i = 0; i < this.items.length; i++) {
                    const idx = this.items[i];
                    const itNode = state.nodes[idx];
                    const dir = polarityDirections[idx];
                    const str = polarityStrengths[idx];
                    const m = Math.abs(str * dir) || 1;
                    this.cx += itNode.x * m;
                    this.cy += itNode.y * m;
                    this.mass += m;
                    this.polarity += str * dir;
                }
            }
            if (this.mass > 0) {
                this.cx /= this.mass;
                this.cy /= this.mass;
            }
        }
    }

    const traversalStack = new Array(512);

    function runPairwisePass(ctx) {
        poolIndex = 0;
        const { repulsion, polarityDirections, polarityStrengths, motionProfile, nodeCount, tickCounter } = ctx;
        let THETA = 0.9;
        if (nodeCount > 10000) THETA = 1.5; // More aggressive for ultra massive
        else if (nodeCount > 5000) THETA = 1.1;

        if (state.nodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < state.nodes.length; i++) {
            const n = state.nodes[i];
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        const width = maxX - minX;
        const height = maxY - minY;
        const size = Math.max(width, height, 100);
        const root = getQuadNode(minX, minY, size + 1);

        for (let i = 0; i < state.nodes.length; i++) {
            root.insert(i, state.nodes[i].x, state.nodes[i].y);
        }
        root.computeMass(polarityDirections, polarityStrengths);

        const chunkDivisor = nodeCount > 10000 ? 3 : (nodeCount > 5000 ? 2 : 1);

        for (let index = 0; index < state.nodes.length; index += 1) {
            const node = state.nodes[index];
            if (isNodeStatic(node)) continue;
            if (chunkDivisor > 1 && (index % chunkDivisor !== tickCounter % chunkDivisor)) continue;

            if (state.pointer.mode === 'node' && state.pointer.node && state.pointer.node.id === node.id) {
                node.vx = 0;
                node.vy = 0;
                continue;
            }

            let stackPtr = 0;
            traversalStack[stackPtr++] = root;
            
            while (stackPtr > 0) {
                const quad = traversalStack[--stackPtr];
                if (!quad || quad.mass === 0) continue;

                const dx = quad.cx - node.x;
                const dy = quad.cy - node.y;
                const distSq = (dx * dx) + (dy * dy);

                if (quad.children && (quad.size * quad.size / Math.max(36, distSq)) > (THETA * THETA)) {
                    traversalStack[stackPtr++] = quad.children[0];
                    traversalStack[stackPtr++] = quad.children[1];
                    traversalStack[stackPtr++] = quad.children[2];
                    traversalStack[stackPtr++] = quad.children[3];
                } else {
                    if (quad.items) {
                        for (let i = 0; i < quad.items.length; i++) {
                            const otherIdx = quad.items[i];
                            const other = state.nodes[otherIdx];
                            if (other.id === node.id) continue;

                            const odx = other.x - node.x;
                            const ody = other.y - node.y;
                            const odistSq = Math.max(36, (odx * odx) + (ody * ody));
                            const oforce = repulsion / odistSq;
                            const odist = Math.sqrt(odistSq);
                            const onx = odx / odist;
                            const ony = ody / odist;
                            
                            const isSameChain = node.chainId && node.chainId === other.chainId;
                            let chainFactor = isSameChain 
                                ? (state.chainInternalForcesEnabled ? 0.15 : 0) 
                                : (state.chainExternalForcesEnabled ? 1 : 0);

                            let nodeDepthFactor = 1;
                            let nodeChainFactor = chainFactor;

                            if (state.chainHierarchyEnabled && isSameChain) {
                                const bothFolders = node.kind === 'folder' && other.kind === 'folder';
                                const includeBookmarks = state.bookmarkHierarchyEnabled;
                                if (bothFolders || includeBookmarks) {
                                    const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
                                    const otherDepth = (other.data && typeof other.data.depth === 'number') ? other.data.depth : 0;
            
                                    if (nodeDepth < otherDepth) {
                                        const gap = otherDepth - nodeDepth;
                                        nodeDepthFactor = Math.max(0.04, 0.15 / gap);
                                    } else if (otherDepth < nodeDepth) {
                                        const gap = nodeDepth - otherDepth;
                                        const isNodeLink = node.kind === 'link';
                                        nodeDepthFactor = isNodeLink ? (1.0 + gap * 0.2) : (1.0 + gap * 0.5);
                                        nodeChainFactor = isNodeLink ? 0.15 : 0.35;
                                    }
                                }
                            }

                            const otherDir = polarityDirections[otherIdx];
                            const otherStr = polarityStrengths[otherIdx];
                            const chunkForce = chunkDivisor === 3 ? 1.8 : (chunkDivisor === 2 ? 1.4 : 1);
                            const nodeInfluenceScale = getPairwiseInfluenceScale(node, other, motionProfile) * nodeChainFactor * nodeDepthFactor * chunkForce;
                            node.vx += onx * oforce * otherDir * otherStr * nodeInfluenceScale;
                            node.vy += ony * oforce * otherDir * otherStr * nodeInfluenceScale;
                        }
                    } else {
                        const distSqEff = Math.max(36, distSq);
                        const force = repulsion * (quad.mass) / distSqEff;
                        const dist = Math.sqrt(distSqEff);
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const externalChainFactor = state.chainExternalForcesEnabled ? 1 : 0;
                        const chunkForce = chunkDivisor === 3 ? 1.8 : (chunkDivisor === 2 ? 1.4 : 1);
                        const nodeInfluenceScale = getPairwiseInfluenceScale(node, node, motionProfile) * externalChainFactor * chunkForce;
                        
                        const avgPolarity = quad.polarity / quad.mass;
                        node.vx += nx * force * avgPolarity * nodeInfluenceScale;
                        node.vy += ny * force * avgPolarity * nodeInfluenceScale;
                    }
                }
            }
        }
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runPairwisePass });

})(window.EveConstellationMap);

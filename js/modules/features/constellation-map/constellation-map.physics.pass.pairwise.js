window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getPairwiseInfluenceScale } = physicsHelpers;

    class QuadTreeNode {
        constructor(x, y, size) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.items = null;
            this.children = null;
            this.cx = 0;
            this.cy = 0;
            this.mass = 0;
            this.polarity = 0;
        }

        insert(item) {
            if (this.children) {
                const right = item.node.x >= this.x + this.size / 2;
                const bottom = item.node.y >= this.y + this.size / 2;
                const index = (bottom ? 2 : 0) + (right ? 1 : 0);
                this.children[index].insert(item);
                return;
            }
            if (!this.items) this.items = [];
            this.items.push(item);
            if (this.items.length > 4 && this.size > 20) {
                this.children = [
                    new QuadTreeNode(this.x, this.y, this.size / 2),
                    new QuadTreeNode(this.x + this.size / 2, this.y, this.size / 2),
                    new QuadTreeNode(this.x, this.y + this.size / 2, this.size / 2),
                    new QuadTreeNode(this.x + this.size / 2, this.y + this.size / 2, this.size / 2)
                ];
                for (const it of this.items) {
                    const right = it.node.x >= this.x + this.size / 2;
                    const bottom = it.node.y >= this.y + this.size / 2;
                    const index = (bottom ? 2 : 0) + (right ? 1 : 0);
                    this.children[index].insert(it);
                }
                this.items = null;
            }
        }

        computeMass() {
            this.cx = 0; this.cy = 0; this.mass = 0; this.polarity = 0;
            if (this.children) {
                for (let i = 0; i < 4; i++) {
                    const c = this.children[i];
                    c.computeMass();
                    if (c.mass > 0) {
                        this.cx += c.cx * c.mass;
                        this.cy += c.cy * c.mass;
                        this.mass += c.mass;
                        this.polarity += c.polarity;
                    }
                }
            } else if (this.items) {
                for (let i = 0; i < this.items.length; i++) {
                    const it = this.items[i];
                    const m = Math.abs(it.polarity.strength * it.polarity.direction) || 1;
                    this.cx += it.node.x * m;
                    this.cy += it.node.y * m;
                    this.mass += m;
                    this.polarity += it.polarity.strength * it.polarity.direction;
                }
            }
            if (this.mass > 0) {
                this.cx /= this.mass;
                this.cy /= this.mass;
            }
        }
    }

    function runPairwisePass(ctx) {
        const { repulsion, polarityCache, motionProfile } = ctx;
        const THETA = 0.9;

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
        const root = new QuadTreeNode(minX, minY, size + 1);

        for (let i = 0; i < state.nodes.length; i++) {
            root.insert({ node: state.nodes[i], polarity: polarityCache[i], isStatic: isNodeStatic(state.nodes[i]) });
        }
        root.computeMass();

        for (let index = 0; index < state.nodes.length; index += 1) {
            const node = state.nodes[index];
            if (isNodeStatic(node)) continue;

            if (state.pointer.mode === 'node' && state.pointer.node && state.pointer.node.id === node.id) {
                node.vx = 0;
                node.vy = 0;
                continue;
            }

            const queue = [root];
            while (queue.length > 0) {
                const quad = queue.shift();
                if (!quad || quad.mass === 0) continue;

                const dx = quad.cx - node.x;
                const dy = quad.cy - node.y;
                const distSq = Math.max(36, (dx * dx) + (dy * dy));

                if (quad.children && (quad.size / Math.sqrt(distSq)) > THETA) {
                    queue.push(quad.children[0], quad.children[1], quad.children[2], quad.children[3]);
                } else {
                    if (quad.items) {
                        for (let i = 0; i < quad.items.length; i++) {
                            const otherItem = quad.items[i];
                            const other = otherItem.node;
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

                            const nodeInfluenceScale = getPairwiseInfluenceScale(node, other, motionProfile) * nodeChainFactor * nodeDepthFactor;
                            node.vx += onx * oforce * otherItem.polarity.direction * otherItem.polarity.strength * nodeInfluenceScale;
                            node.vy += ony * oforce * otherItem.polarity.direction * otherItem.polarity.strength * nodeInfluenceScale;
                        }
                    } else if (quad.children) {
                        const force = repulsion * (quad.mass) / distSq;
                        const dist = Math.sqrt(distSq);
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const externalChainFactor = state.chainExternalForcesEnabled ? 1 : 0;
                        const nodeInfluenceScale = getPairwiseInfluenceScale(node, node, motionProfile) * externalChainFactor;
                        
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

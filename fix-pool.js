const fs = require('fs');
const file = 'js/modules/features/constellation-map/constellation-map.physics.pass.pairwise.js';
let content = fs.readFileSync(file, 'utf-8');

const replacementClassBlock = `
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
                    getQuadNode(this.x, this.y, this.size / 2),
                    getQuadNode(this.x + this.size / 2, this.y, this.size / 2),
                    getQuadNode(this.x, this.y + this.size / 2, this.size / 2),
                    getQuadNode(this.x + this.size / 2, this.y + this.size / 2, this.size / 2)
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
`;

content = content.replace(/class QuadTreeNode \{[\s\S]*?computeMass\(\) \{/, replacementClassBlock + '        computeMass() {');

content = content.replace(
    /function runPairwisePass\(ctx\) \{/,
    'function runPairwisePass(ctx) {\n        poolIndex = 0;'
);

content = content.replace(
    /const root = new QuadTreeNode\(minX, minY, size \+ 1\);/,
    'const root = getQuadNode(minX, minY, size + 1);'
);

fs.writeFileSync(file, content);
console.log("POOL_APPLIED");

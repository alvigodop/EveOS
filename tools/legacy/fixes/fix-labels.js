const fs = require('fs');
const file = 'js/modules/features/constellation-map/constellation-map.render.js';
let content = fs.readFileSync(file, 'utf-8');

// Completely disable ambient label shadow blur - the worst offender for 2D Canvas performance
content = content.replace(
    /ctx\.shadowBlur = box\.isHovered \|\| box\.isSelected \? 12 : 6;/g,
    "ctx.shadowBlur = box.isHovered || box.isSelected ? 12 : 0;"
);

// If the backdrop has a shadow or heavy styling, reduce that too dynamically if needed
content = content.replace(
    /ctx\.shadowBlur = 0;\s*ctx\.fillStyle = `rgba\(255,255,255,\${labelOpacity}\)`;/g,
    "ctx.shadowBlur = 0;\n            ctx.fillStyle = `rgba(255,255,255,${labelOpacity})`;"
);

fs.writeFileSync(file, content);
console.log('LABELS_FIXED_SUCCESS');

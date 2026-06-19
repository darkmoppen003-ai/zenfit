const fs = require('fs');

// ── Update index.html ──────────────────────────────

const indexPath = 'index.html';
let indexContent = fs.readFileSync(indexPath, 'utf8');

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');

const buildMatch = indexContent.match(
  /const APP_BUILD="([^"]+)"/
);

let buildNumber = 1;
if (buildMatch) {
  const oldBuild = buildMatch[1];
  const parts = oldBuild.split('.');
  if (parts.length === 4) {
    buildNumber = parseInt(parts[3]) + 1;
  }
}

const newBuild = `${year}.${month}.${day}.${buildNumber}`;

indexContent = indexContent.replace(
  /const APP_BUILD="([^"]+)"/,
  `const APP_BUILD="${newBuild}"`
);

fs.writeFileSync(indexPath, indexContent);

// ── Update sw.js (ensures SW file changes → browser detects update) ──

const swPath = 'sw.js';
let swContent = fs.readFileSync(swPath, 'utf8');

swContent = swContent.replace(
  /const SW_BUILD = "([^"]+)"/,
  `const SW_BUILD = "${newBuild}"`
);

fs.writeFileSync(swPath, swContent);

console.log('Updated build:', newBuild);
console.log('Updated sw.js build:', newBuild);

const fs = require('fs');
const path = require('path');

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

// ── Auto-glob assets/bg/* into STATIC_ASSETS ──

const bgDir = path.join(__dirname, '..', 'assets', 'bg');
const validImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
let bgFiles = [];
try {
  bgFiles = fs.readdirSync(bgDir)
    .filter(f => !f.startsWith('.'))
    .filter(f => validImageExts.some(ext => f.toLowerCase().endsWith(ext)));
} catch {
  // Directory doesn't exist or is empty — no-op
  bgFiles = [];
}

if (bgFiles.length > 0) {
  // Find the STATIC_ASSETS array in sw.js
  const staticAssetsMatch = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\n\];/);
  if (staticAssetsMatch) {
    const existingAssets = staticAssetsMatch[1];
    const existingBgEntries = new Set();
    
    // Extract existing ./assets/bg/ entries
    const bgEntryRegex = /'(\.\/assets\/bg\/[^']+)'/g;
    let match;
    while ((match = bgEntryRegex.exec(existingAssets)) !== null) {
      existingBgEntries.add(match[1]);
    }
    
    // Build new entries for files not already present
    const newEntries = bgFiles
      .map(f => `./assets/bg/${f}`)
      .filter(entry => !existingBgEntries.has(entry))
      .map(entry => `  '${entry}',`);
    
    if (newEntries.length > 0) {
      // Insert new entries before the closing bracket
      const newAssetsContent = existingAssets.trimEnd() + '\n' + newEntries.join('\n') + '\n';
      swContent = swContent.replace(
        /const STATIC_ASSETS = \[([\s\S]*?)\n\];/,
        `const STATIC_ASSETS = [${newAssetsContent}];`
      );
    }
  }
}

fs.writeFileSync(swPath, swContent);

console.log('Updated build:', newBuild);
console.log('Updated sw.js build:', newBuild);
if (bgFiles.length > 0) {
  console.log('Auto-added bg assets:', bgFiles.map(f => `./assets/bg/${f}`).join(', '));
}

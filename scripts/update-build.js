const fs = require('fs');
const path = require('path');

// ZenFit V2 — bump APP_BUILD (modules/core/store.js) + SW_BUILD (sw.js)
// Run: node scripts/update-build.js  (also wired to GitHub Actions)

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');

function nextBuild(current) {
  const parts = String(current || '').split('.');
  const n = parts.length === 4 ? parseInt(parts[3], 10) + 1 : 1;
  return `${year}.${month}.${day}.${Number.isFinite(n) ? n : 1}`;
}

const storePath = path.join(__dirname, '..', 'modules', 'core', 'store.js');
let storeContent = fs.readFileSync(storePath, 'utf8');
const appMatch = storeContent.match(/export const APP_BUILD = ['"]([^'"]+)['"]/);
const newBuild = nextBuild(appMatch && appMatch[1]);
storeContent = storeContent.replace(
  /export const APP_BUILD = ['"]([^'"]+)['"]/,
  `export const APP_BUILD = "${newBuild}"`
);
fs.writeFileSync(storePath, storeContent);

const swPath = path.join(__dirname, '..', 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(
  /const SW_BUILD = ['"]([^'"]+)['"]/,
  `const SW_BUILD = "${newBuild}"`
);

// ── Auto-glob wallpapers + zen audio into STATIC_ASSETS ──
function globAssets(relDir, exts) {
  try {
    return fs.readdirSync(path.join(__dirname, '..', relDir))
      .filter((f) => !f.startsWith('.'))
      .filter((f) => exts.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((f) => `./${relDir}/${f}`);
  } catch { return []; }
}

const autoFiles = [
  ...globAssets('assets/bg', ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']),
  ...globAssets('assets/zen', ['.mp3', '.ogg', '.wav']),
  ...globAssets('assets/mascot', ['.png', '.gif', '.jpg']),
];

const m = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\n\];/);
if (m) {
  const existing = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  const fresh = autoFiles.filter((f) => !existing.has(f)).map((f) => `  '${f}',`);
  if (fresh.length) {
    swContent = swContent.replace(
      /const STATIC_ASSETS = \[([\s\S]*?)\n\];/,
      `const STATIC_ASSETS = [${m[1].trimEnd()}\n${fresh.join('\n')}\n];`
    );
  }
}

fs.writeFileSync(swPath, swContent);
console.log('Updated build:', newBuild);
console.log('Auto-added assets:', autoFiles.length, 'total tracked');

const fs = require('fs');

const filePath = 'index.html';

let content = fs.readFileSync(filePath, 'utf8');

const now = new Date();

const year = now.getFullYear();

const month = String(now.getMonth() + 1).padStart(2, '0');

const day = String(now.getDate()).padStart(2, '0');

const buildMatch = content.match(
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

const newBuild =
  `${year}.${month}.${day}.${buildNumber}`;

content = content.replace(
  /const APP_BUILD="([^"]+)"/,
  `const APP_BUILD="${newBuild}"`
);

fs.writeFileSync(filePath, content);

console.log('Updated build:', newBuild);

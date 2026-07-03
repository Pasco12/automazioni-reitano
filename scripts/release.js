const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageFile = path.join(root, 'package.json');
const settingsFile = path.join(root, 'data', 'app-settings.json');
const swFile = path.join(root, 'public', 'service-worker.js');

function bump(version, type) {
  const parts = String(version || '1.0.0').split('.').map((n) => Number(n) || 0);
  if (type === 'major') return `${parts[0] + 1}.0.0`;
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

const type = process.argv[2] || 'patch';
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
pkg.version = bump(pkg.version, type);
fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

const settings = fs.existsSync(settingsFile)
  ? JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  : { paymentMethods: [] };
settings.version = {
  app: pkg.version,
  releasedAt: new Date().toISOString(),
  notes: process.argv.slice(3).join(' ') || `Aggiornamento ${type}`
};
fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);

if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'reitano-app-[^']+';/, `const CACHE_NAME = 'reitano-app-v${pkg.version}';`);
  fs.writeFileSync(swFile, sw);
}

console.log(`Versione aggiornata a ${pkg.version}`);
console.log('Ricorda: npm install se hai modificato dipendenze, poi riavvia server e pubblica.');

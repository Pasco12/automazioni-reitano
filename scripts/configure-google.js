const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const clientId = process.argv[2];
const publicUrl = process.argv[3];

if (!clientId || !clientId.includes('.apps.googleusercontent.com')) {
  console.error('Uso corretto: npm run config:google -- TUO_CLIENT_ID.apps.googleusercontent.com https://tuodominio.it');
  process.exit(1);
}

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

function upsert(key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(env)) env = env.replace(re, line);
  else env += `${env.endsWith('\n') || env.length === 0 ? '' : '\n'}${line}\n`;
}

upsert('GOOGLE_CLIENT_ID', clientId);
if (publicUrl) upsert('PUBLIC_URL', publicUrl.replace(/\/$/, ''));

fs.writeFileSync(envPath, env);
console.log('Google Login configurato nel file .env');
console.log(`GOOGLE_CLIENT_ID=${clientId}`);
if (publicUrl) console.log(`PUBLIC_URL=${publicUrl.replace(/\/$/, '')}`);
console.log('Riavvia il server: npm start oppure pm2 restart reitano');

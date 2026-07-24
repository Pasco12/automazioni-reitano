require('dotenv').config();

const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-subito';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'reitano-local-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const DEFAULT_CONTENT_FILE = path.join(DATA_DIR, 'default-content.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const INTERVENTIONS_FILE = path.join(DATA_DIR, 'interventions.json');
const INVOICES_FILE = path.join(DATA_DIR, 'invoices.json');
const APP_SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SQLITE_FILE = path.join(DATA_DIR, 'reitano.sqlite');
let jsonDb = null;
let storageMode = 'json';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DEFAULT_CONTENT_FILE) && fs.existsSync(CONTENT_FILE)) fs.copyFileSync(CONTENT_FILE, DEFAULT_CONTENT_FILE);
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]\n');
if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, '[]\n');
if (!fs.existsSync(INTERVENTIONS_FILE)) fs.writeFileSync(INTERVENTIONS_FILE, '[]\n');
if (!fs.existsSync(INVOICES_FILE)) fs.writeFileSync(INVOICES_FILE, '[]\n');
if (!fs.existsSync(PANELS_FILE)) fs.writeFileSync(PANELS_FILE, '[]\n');
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]\n');
if (!fs.existsSync(APP_SETTINGS_FILE)) {
  fs.writeFileSync(APP_SETTINGS_FILE, `${JSON.stringify({
    paymentMethods: [
      {
        id: crypto.randomUUID(),
        name: 'Bonifico bancario',
        type: 'bank_transfer',
        details: 'IBAN da inserire - Intestatario Reitano Automazioni',
        enabled: true
      },
      {
        id: crypto.randomUUID(),
        name: 'Pagamento alla consegna/intervento',
        type: 'onsite',
        details: 'Contanti, assegno o accordi diretti in fase di intervento.',
        enabled: true
      }
    ]
  }, null, 2)}\n`);
}

function dataKeyForFile(file) {
  const normalized = path.resolve(file);
  if (!normalized.startsWith(DATA_DIR)) return '';
  return path.basename(normalized, '.json');
}

function initJsonDatabase() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    jsonDb = new DatabaseSync(SQLITE_FILE);
    jsonDb.exec(`
      CREATE TABLE IF NOT EXISTS json_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    storageMode = 'sqlite';
    console.log(`Database SQLite attivo: ${SQLITE_FILE}`);
  } catch (error) {
    jsonDb = null;
    storageMode = 'json';
    console.log('Database SQLite non disponibile: uso file JSON. Con Node 24+ verrà usato SQLite automaticamente.');
  }
}

function dbGetJson(key) {
  if (!jsonDb || !key) return undefined;
  const row = jsonDb.prepare('SELECT value FROM json_store WHERE key = ?').get(key);
  if (!row) return undefined;
  return JSON.parse(row.value);
}

function dbSetJson(key, data) {
  if (!jsonDb || !key) return;
  jsonDb.prepare(`
    INSERT INTO json_store (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(data), new Date().toISOString());
}

initJsonDatabase();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Un solo host canonico in produzione. In locale non forza redirect.
app.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isHttps = req.secure || forwardedProto === 'https';
  if (host === 'automazionireitano.it' || (host === 'www.automazionireitano.it' && !isHttps)) {
    return res.redirect(301, `https://www.automazionireitano.it${req.originalUrl}`);
  }
  next();
});

// Le API non devono essere cachate: così ogni modifica fatta da admin
// si vede sul sito appena ricarichi la pagina. La cache statica resta attiva.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const realtimeClients = new Set();

function broadcastEvent(type, payload = {}) {
  const event = {
    type,
    payload,
    time: new Date().toISOString()
  };
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of realtimeClients) {
    try { client.write(data); } catch (error) { realtimeClients.delete(client); }
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
  realtimeClients.add(res);
  req.on('close', () => realtimeClients.delete(res));
});

app.get('/api/public-config', async (req, res) => {
  res.json({ ok: true, googleClientId: GOOGLE_CLIENT_ID || '' });
});

app.get('/api/version', async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [], version: {} });
  const pkg = await readJson(path.join(ROOT, 'package.json'), { version: '1.0.0' });
  res.json({
    ok: true,
    storage: storageMode,
    realtime: true,
    version: settings.version || { app: pkg.version || '1.0.0' },
    time: new Date().toISOString()
  });
});

function adminToken() {
  // Token legacy mantenuto solo per compatibilità interna; il nuovo login usa token firmati con scadenza.
  return crypto
    .createHash('sha256')
    .update(`${ADMIN_PASSWORD}:${ADMIN_SECRET}`)
    .digest('hex');
}

function safeCompare(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function getSecuritySettings() {
  return readJson(SECURITY_FILE, { adminPassword: null, passwordChangedAt: null, passwordResetTokens: [] });
}

async function verifyAdminPassword(password) {
  const settings = await getSecuritySettings();
  if (settings.adminPassword?.salt && settings.adminPassword?.hash) {
    return verifyPassword(password, settings.adminPassword);
  }
  return safeCompare(String(password || ''), ADMIN_PASSWORD);
}

async function setAdminPassword(newPassword) {
  const settings = await getSecuritySettings();
  settings.adminPassword = hashPassword(newPassword);
  settings.passwordChangedAt = new Date().toISOString();
  await writeJson(SECURITY_FILE, settings);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyPayload(token);
  if (payload?.type === 'admin') return next();

  // Compatibilità con vecchi token se presenti.
  if (token && safeCompare(token, adminToken())) return next();

  return res.status(401).json({ ok: false, error: 'Non autorizzato' });
}

// Rate limit leggero in memoria per endpoint sensibili.
const rateBuckets = new Map();
function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: 'Troppe richieste. Riprova tra poco.' });
    }
    next();
  };
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signPayload(payload) {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  if (!safeCompare(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function clientToken(client) {
  return signPayload({ type: 'client', sub: client.id, email: client.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
}

async function requireClient(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyPayload(token);
  if (!payload || payload.type !== 'client' || !payload.sub) {
    return res.status(401).json({ ok: false, error: 'Accesso cliente richiesto' });
  }
  const clients = await readJson(CLIENTS_FILE, []);
  const client = clients.find((item) => item.id === payload.sub && item.status !== 'archived');
  if (!client) return res.status(401).json({ ok: false, error: 'Cliente non trovato' });
  req.client = client;
  next();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, passwordData = {}) {
  if (!passwordData.salt || !passwordData.hash) return false;
  const check = hashPassword(password, passwordData.salt).hash;
  return safeCompare(check, passwordData.hash);
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32ToBuffer(secret) {
  const clean = String(secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value >= 0) bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const key = base32ToBuffer(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code, window = 1) {
  const cleanCode = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -window; drift <= window; drift += 1) {
    if (safeCompare(hotp(secret, counter + drift), cleanCode)) return true;
  }
  return false;
}

async function adminOtpAuthUri(secret) {
  const content = await readJson(CONTENT_FILE, {});
  const issuer = encodeURIComponent(content?.brand?.shortName || 'Reitano Automazioni');
  const account = encodeURIComponent('Admin');
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

async function getAdmin2faState() {
  const settings = await getSecuritySettings();
  return {
    enabled: Boolean(settings.twoFactor?.enabled && settings.twoFactor?.secret),
    enabledAt: settings.twoFactor?.enabledAt || null,
    pending: Boolean(settings.twoFactor?.pendingSecret)
  };
}

function publicClient(client) {
  if (!client) return null;
  const { password, ...safe } = client;
  return safe;
}

function money(value) {
  const n = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function invoiceTotals(items = []) {
  let subtotal = 0;
  let vat = 0;
  for (const item of items) {
    const qty = money(item.qty || 1);
    const unitPrice = money(item.unitPrice);
    const vatRate = money(item.vatRate || 22);
    const line = qty * unitPrice;
    subtotal += line;
    vat += line * vatRate / 100;
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total: Math.round((subtotal + vat) * 100) / 100
  };
}

function parseInvoiceItems(rawItems) {
  if (Array.isArray(rawItems)) {
    return rawItems.map((item) => ({
      description: cleanText(item.description, 300) || 'Voce fattura',
      qty: money(item.qty || 1),
      unitPrice: money(item.unitPrice),
      vatRate: money(item.vatRate ?? 22)
    })).filter((item) => item.description && item.qty > 0);
  }
  return String(rawItems || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [description, qty = '1', unitPrice = '0', vatRate = '22'] = line.split('|').map((part) => part.trim());
      return { description: cleanText(description, 300), qty: money(qty), unitPrice: money(unitPrice), vatRate: money(vatRate) };
    })
    .filter((item) => item.description && item.qty > 0);
}

function nextInvoiceNumber(invoices) {
  const year = new Date().getFullYear();
  const prefix = `RA-${year}-`;
  const nums = invoices
    .map((invoice) => String(invoice.number || ''))
    .filter((number) => number.startsWith(prefix))
    .map((number) => Number(number.replace(prefix, '')))
    .filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function invoiceDueInfo(invoice) {
  if (!invoice?.dueDate) return { hasDueDate: false, daysLeft: null, level: 'none', label: 'Nessuna scadenza' };
  const due = new Date(`${invoice.dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return { hasDueDate: false, daysLeft: null, level: 'none', label: 'Scadenza non valida' };
  const today = new Date();
  const ms = due.getTime() - today.getTime();
  const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { hasDueDate: true, daysLeft, level: 'overdue', label: `Scaduta da ${Math.abs(daysLeft)} giorni` };
  if (daysLeft === 0) return { hasDueDate: true, daysLeft, level: 'today', label: 'Scade oggi' };
  if (daysLeft <= 7) return { hasDueDate: true, daysLeft, level: 'soon', label: `Scade tra ${daysLeft} giorni` };
  return { hasDueDate: true, daysLeft, level: 'ok', label: `Scade tra ${daysLeft} giorni` };
}

function refreshInvoiceDeadlines(invoices) {
  let changed = false;
  const deadlines = [];
  const now = new Date().toISOString();
  for (const invoice of invoices) {
    invoice.reminders = Array.isArray(invoice.reminders) ? invoice.reminders : [];
    invoice.paymentType = invoice.paymentType || 'Bonifico';
    const info = invoiceDueInfo(invoice);
    invoice.dueInfo = info;
    if (info.level === 'overdue' && !['paid', 'cancelled', 'overdue'].includes(invoice.status)) {
      invoice.status = 'overdue';
      invoice.updatedAt = now;
      changed = true;
    }
    if (['overdue', 'today', 'soon'].includes(info.level) && !['paid', 'cancelled'].includes(invoice.status)) {
      deadlines.push(invoice);
      const key = `${info.level}:${invoice.dueDate}`;
      if (!invoice.reminders.some((reminder) => reminder.key === key)) {
        invoice.reminders.push({
          id: crypto.randomUUID(),
          key,
          type: info.level,
          message: `${info.label} - fattura ${invoice.number}`,
          createdAt: now,
          sentEmail: false,
          readByAdmin: false
        });
        changed = true;
      }
    }
  }
  return { changed, deadlines };
}

function interventionStatusLabel(status) {
  return ({
    requested: 'Richiesto',
    scheduled: 'Programmato',
    in_progress: 'In lavorazione',
    waiting_parts: 'In attesa materiali',
    completed: 'Completato',
    cancelled: 'Annullato'
  })[status] || status || 'Richiesto';
}

function parseSignals(rawSignals) {
  if (Array.isArray(rawSignals)) {
    return rawSignals.map((signal) => ({
      id: signal.id || crypto.randomUUID(),
      name: cleanText(signal.name, 120) || 'Segnale',
      unit: cleanText(signal.unit, 30),
      type: cleanText(signal.type, 60) || 'analog',
      value: cleanText(signal.value, 80),
      min: cleanText(signal.min, 80),
      max: cleanText(signal.max, 80),
      status: cleanText(signal.status, 60) || 'ok',
      updatedAt: signal.updatedAt || new Date().toISOString()
    })).filter((signal) => signal.name);
  }
  return String(rawSignals || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, unit = '', value = '', min = '', max = '', status = 'ok', type = 'analog'] = line.split('|').map((part) => part.trim());
      return {
        id: crypto.randomUUID(),
        name: cleanText(name, 120) || 'Segnale',
        unit: cleanText(unit, 30),
        value: cleanText(value, 80),
        min: cleanText(min, 80),
        max: cleanText(max, 80),
        status: cleanText(status, 60) || 'ok',
        type: cleanText(type, 60) || 'analog',
        updatedAt: new Date().toISOString()
      };
    });
}

function panelStatusLabel(status) {
  return ({ online: 'Online', offline: 'Offline', maintenance: 'Manutenzione', alarm: 'Allarme' })[status] || status || 'Offline';
}

function normalizePanel(panel) {
  panel.signals = Array.isArray(panel.signals) ? panel.signals : [];
  panel.history = Array.isArray(panel.history) ? panel.history : [];
  panel.commands = Array.isArray(panel.commands) ? panel.commands : [];
  panel.alarms = Array.isArray(panel.alarms) ? panel.alarms : [];
  return panel;
}

function updatePanelSignals(panel, readings = {}) {
  panel.signals = Array.isArray(panel.signals) ? panel.signals : [];
  const now = new Date().toISOString();
  for (const [name, value] of Object.entries(readings)) {
    let signal = panel.signals.find((item) => item.id === name || item.name === name);
    if (!signal) {
      signal = { id: crypto.randomUUID(), name: cleanText(name, 120), unit: '', type: 'analog', min: '', max: '', status: 'ok' };
      panel.signals.push(signal);
    }
    signal.value = cleanText(value, 80);
    signal.updatedAt = now;
    const n = Number(String(value).replace(',', '.'));
    const min = signal.min !== '' ? Number(String(signal.min).replace(',', '.')) : NaN;
    const max = signal.max !== '' ? Number(String(signal.max).replace(',', '.')) : NaN;
    signal.status = Number.isFinite(n) && ((Number.isFinite(min) && n < min) || (Number.isFinite(max) && n > max)) ? 'alarm' : 'ok';
  }
  panel.lastSeen = now;
  panel.history = Array.isArray(panel.history) ? panel.history : [];
  panel.history.push({ id: crypto.randomUUID(), createdAt: now, readings });
  panel.history = panel.history.slice(-500);
}

function applyPanelCommand(panel, command) {
  if (!panel.controlEnabled) return;
  if (command.type === 'power_on') panel.powerState = 'on';
  if (command.type === 'power_off') panel.powerState = 'off';
  if (command.type === 'reset_alarm') {
    panel.status = 'online';
    panel.alarms = [];
    panel.signals = (panel.signals || []).map((signal) => ({ ...signal, status: signal.status === 'alarm' ? 'ok' : signal.status }));
  }
}

async function readJson(file, fallback) {
  const key = dataKeyForFile(file);

  // IMPORTANTE: content.json resta sempre modificabile a mano.
  // Con Node 24 SQLite può essere attivo; senza questa precedenza il sito leggerebbe
  // il vecchio valore dal DB e le modifiche manuali a data/content.json non si vedrebbero.
  const fileFirstKeys = new Set(['content', 'default-content']);
  if (fileFirstKeys.has(key)) {
    try {
      const raw = await fsp.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      if (jsonDb && key) {
        try { dbSetJson(key, data); } catch (error) { console.error(`Errore sync SQLite ${key}:`, error.message); }
      }
      return data;
    } catch (fileError) {
      console.error(`Errore lettura ${path.basename(file)}:`, fileError.message);
      // Se il JSON è rotto, proviamo a non buttare giù il sito e leggiamo il DB/fallback.
    }
  }

  if (jsonDb && key) {
    try {
      const data = dbGetJson(key);
      if (data !== undefined) return data;
    } catch (error) {
      console.error(`Errore lettura SQLite ${key}:`, error.message);
    }
  }

  try {
    const raw = await fsp.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (jsonDb && key) {
      try { dbSetJson(key, data); } catch (error) { console.error(`Errore seed SQLite ${key}:`, error.message); }
    }
    return data;
  } catch (error) {
    if (jsonDb && key) {
      try { dbSetJson(key, fallback); } catch (dbError) { console.error(`Errore fallback SQLite ${key}:`, dbError.message); }
    }
    return fallback;
  }
}

async function writeJson(file, data) {
  const key = dataKeyForFile(file);
  if (jsonDb && key) {
    try { dbSetJson(key, data); } catch (error) { console.error(`Errore scrittura SQLite ${key}:`, error.message); }
  }

  // Backup leggibile: il database è la sorgente principale quando SQLite è disponibile.
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, file);
}

function cleanText(value, max = 1800) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizePhoneForWhatsApp(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('00')) return text.slice(2).replace(/\D/g, '');
  return text.replace(/\D/g, '');
}

function buildWhatsAppUrl(content, lead) {
  const phone = normalizePhoneForWhatsApp(content?.contact?.whatsapp || content?.contact?.phone || '');
  if (!phone) return '';

  const intro = lead.type === 'quote'
    ? 'vorrei richiedere un preventivo.'
    : 'vorrei ricevere informazioni.';

  const message = [
    `Ciao ${content?.brand?.shortName || content?.brand?.name || 'Reitano Automazioni'}, ${intro}`,
    lead.name ? `Nome: ${lead.name}` : '',
    lead.company ? `Azienda: ${lead.company}` : '',
    lead.phone ? `Telefono: ${lead.phone}` : '',
    lead.email ? `Email: ${lead.email}` : '',
    lead.service ? `Servizio: ${lead.service}` : '',
    lead.location ? `Zona: ${lead.location}` : '',
    lead.timeframe ? `Urgenza: ${lead.timeframe}` : '',
    lead.preferredContact ? `Contatto preferito: ${lead.preferredContact}` : '',
    lead.message ? `Messaggio: ${lead.message}` : ''
  ].filter(Boolean).join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function smtpTransport() {
  if (!process.env.SMTP_HOST) return null;

  const auth = process.env.SMTP_USER && process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth
  });
}

function leadRows(lead) {
  return [
    ['Tipo richiesta', lead.type === 'quote' ? 'Preventivo' : 'Contatto'],
    ['Nome', lead.name],
    ['Azienda', lead.company],
    ['Telefono', lead.phone],
    ['Email', lead.email],
    ['Servizio', lead.service],
    ['Zona intervento', lead.location],
    ['Urgenza', lead.timeframe],
    ['Contatto preferito', lead.preferredContact],
    ['Messaggio', lead.message],
    ['Data', new Date(lead.createdAt).toLocaleString('it-IT')]
  ].filter(([, value]) => Boolean(value));
}

function buildLeadPlainText(lead) {
  return leadRows(lead).map(([label, value]) => `${label}: ${value}`).join('\n');
}

function buildLeadHtml(lead, content) {
  const rows = leadRows(lead).map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700;width:180px;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;white-space:pre-wrap;">${escapeHtml(value)}</td>
    </tr>
  `).join('');

  return `
    <div style="margin:0;padding:24px;background:#f6f8fb;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;">
        <div style="padding:22px 24px;background:linear-gradient(135deg,#14b8a6,#2563eb);color:#ffffff;">
          <h1 style="margin:0;font-size:24px;line-height:1.2;">Nuova richiesta dal sito</h1>
          <p style="margin:8px 0 0;opacity:.9;">${escapeHtml(content?.brand?.name || 'Reitano Automazioni Industriali & Service')}</p>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:15px;">${rows}</table>
        <div style="padding:18px 24px;color:#64748b;font-size:13px;">
          Richiesta salvata anche nel pannello admin del sito.
        </div>
      </div>
    </div>
  `;
}

async function sendLeadEmail(lead, content) {
  const transporter = smtpTransport();
  const to = process.env.MAIL_TO || content?.contact?.email;

  if (!transporter || !to) {
    return { sent: false, skipped: true, error: 'SMTP non configurato' };
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || to;
  const subjectPrefix = lead.type === 'quote' ? 'Nuovo preventivo' : 'Nuovo contatto';

  await transporter.sendMail({
    from,
    to,
    replyTo: lead.email || undefined,
    subject: `${subjectPrefix} - ${lead.name || 'Sito web'}`,
    text: buildLeadPlainText(lead),
    html: buildLeadHtml(lead, content)
  });

  return { sent: true, skipped: false, error: '' };
}

async function sendInvoiceReminderEmail(invoice, client, content, reminder) {
  const transporter = smtpTransport();
  const to = client?.email || invoice.clientEmail;
  if (!transporter || !to) return { sent: false, skipped: true, error: 'SMTP non configurato o email cliente mancante' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || to;
  const subject = `Promemoria pagamento ${invoice.number} - ${reminder.message}`;
  const text = [
    `Gentile ${client?.name || invoice.clientName || 'Cliente'},`,
    `ti ricordiamo la scadenza della fattura ${invoice.number}.`,
    `Stato: ${invoice.status}`,
    `Scadenza: ${invoice.dueDate || 'N/D'}`,
    `Tipo pagamento: ${invoice.paymentType || 'Pagamento'}`,
    `Totale: € ${invoice.totals?.total || 0}`,
    '',
    content?.payment?.paymentNotes || '',
    content?.payment?.iban ? `IBAN: ${content.payment.iban}` : '',
    '',
    'Grazie.'
  ].filter(Boolean).join('\n');
  await transporter.sendMail({ from, to, subject, text });
  return { sent: true, skipped: false, error: '' };
}

async function processInvoiceReminderEmails(invoices, clients, content) {
  let changed = false;
  for (const invoice of invoices) {
    if (['paid', 'cancelled'].includes(invoice.status)) continue;
    const client = clients.find((item) => item.id === invoice.clientId);
    invoice.reminders = Array.isArray(invoice.reminders) ? invoice.reminders : [];
    for (const reminder of invoice.reminders) {
      if (reminder.sentEmail || reminder.emailSkipped) continue;
      try {
        const result = await sendInvoiceReminderEmail(invoice, client, content, reminder);
        reminder.sentEmail = result.sent;
        reminder.emailSkipped = result.skipped;
        reminder.emailError = result.error || '';
        reminder.emailProcessedAt = new Date().toISOString();
        changed = true;
      } catch (error) {
        reminder.sentEmail = false;
        reminder.emailSkipped = false;
        reminder.emailError = error.message;
        reminder.emailProcessedAt = new Date().toISOString();
        changed = true;
      }
    }
  }
  return changed;
}

async function sendClientWelcomeEmail(client, tempPassword = '') {
  const content = await readJson(CONTENT_FILE, {});
  const transporter = smtpTransport();
  if (!transporter || !client?.email) return { sent: false, skipped: true, error: 'SMTP non configurato o email cliente mancante' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || client.email;
  const appUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/app` : '/app';
  const text = [
    `Ciao ${client.name},`,
    `il tuo account area clienti Reitano Automazioni è stato creato.`,
    `Accedi qui: ${appUrl}`,
    tempPassword ? `Password provvisoria: ${tempPassword}` : '',
    `Puoi richiedere interventi, seguire lo stato lavori, consultare fatture e comunicare con l'assistenza.`
  ].filter(Boolean).join('\n');
  await transporter.sendMail({ from, to: client.email, subject: 'Accesso area clienti Reitano Automazioni', text });
  return { sent: true, skipped: false, error: '' };
}

async function sendPasswordResetEmail(client, resetToken) {
  const content = await readJson(CONTENT_FILE, {});
  const transporter = smtpTransport();
  if (!transporter || !client?.email) return { sent: false, skipped: true, error: 'SMTP non configurato o email cliente mancante' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || client.email;
  const base = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : '';
  const link = `${base}/app?reset=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(client.email)}`;
  const text = [
    `Ciao ${client.name},`,
    `hai richiesto il recupero password dell'area clienti.`,
    `Codice recupero: ${resetToken}`,
    `Puoi incollare questo codice nella sezione Recupera dell'app oppure aprire questo link entro 60 minuti:`,
    link,
    `Se non sei stato tu, ignora questa email.`
  ].join('\n');
  await transporter.sendMail({ from, to: client.email, subject: 'Recupero password area clienti', text });
  return { sent: true, skipped: false, error: '' };
}

async function sendClientPasswordChangedEmail(client, options = {}) {
  const content = await readJson(CONTENT_FILE, {});
  const transporter = smtpTransport();
  if (!transporter || !client?.email) return { sent: false, skipped: true, error: 'SMTP non configurato o email cliente mancante' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || client.email;
  const appUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/app` : '/app';
  const by = options.by || 'sistema';
  const tempPassword = options.tempPassword || '';
  const text = [
    `Ciao ${client.name},`,
    `la password della tua area clienti Reitano Automazioni è stata modificata.`,
    `Operazione eseguita da: ${by}.`,
    tempPassword ? `Nuova password provvisoria: ${tempPassword}` : '',
    `Accesso area clienti: ${appUrl}`,
    `Se non hai richiesto tu questa modifica, contatta subito Reitano Automazioni.`
  ].filter(Boolean).join('\n');
  await transporter.sendMail({ from, to: client.email, subject: 'Password area clienti modificata', text });
  return { sent: true, skipped: false, error: '' };
}

async function sendAdminPasswordChangedEmail() {
  const content = await readJson(CONTENT_FILE, {});
  const transporter = smtpTransport();
  const to = process.env.MAIL_TO || content?.contact?.email;
  if (!transporter || !to) return { sent: false, skipped: true, error: 'SMTP non configurato o MAIL_TO mancante' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || to;
  const when = new Date().toLocaleString('it-IT');
  const text = [
    `La password amministratore di Reitano Automazioni è stata modificata.`,
    `Data/ora: ${when}`,
    `Se non sei stato tu, accedi al server e cambia immediatamente ADMIN_SECRET/.env.`
  ].join('\n');
  await transporter.sendMail({ from, to, subject: 'Password amministratore modificata', text });
  return { sent: true, skipped: false, error: '' };
}

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google login non configurato: manca GOOGLE_CLIENT_ID nel file .env.');
  if (!credential) throw new Error('Credenziale Google mancante.');
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || 'Token Google non valido.');
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error('Client ID Google non corrispondente.');
  if (payload.email_verified !== 'true' && payload.email_verified !== true) throw new Error('Email Google non verificata.');
  return {
    googleId: payload.sub,
    email: String(payload.email || '').toLowerCase(),
    name: payload.name || payload.email || 'Cliente Google',
    picture: payload.picture || ''
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = path.basename(file.originalname || 'immagine', ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'immagine';
    cb(null, `${Date.now()}-${name}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato non valido. Usa JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Reitano Automazioni Industriali & Service', storage: storageMode, realtime: true, time: new Date().toISOString() });
});

app.get('/api/content', async (req, res) => {
  const content = await readJson(CONTENT_FILE, {});
  res.json(content);
});

app.get('/api/reviews', async (req, res) => {
  const reviews = await readJson(REVIEWS_FILE, []);
  res.json({ ok: true, reviews: reviews.filter((review) => review.status === 'approved') });
});

app.post('/api/leads', async (req, res) => {
  try {
    if (req.body.website) {
      return res.json({ ok: true });
    }

    const lead = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      type: cleanText(req.body.type, 20) || 'contact',
      name: cleanText(req.body.name, 120),
      company: cleanText(req.body.company, 160),
      phone: cleanText(req.body.phone, 80),
      email: cleanText(req.body.email, 160),
      service: cleanText(req.body.service, 160),
      location: cleanText(req.body.location, 160),
      timeframe: cleanText(req.body.timeframe, 80),
      preferredContact: cleanText(req.body.preferredContact, 80),
      budget: cleanText(req.body.budget, 80),
      message: cleanText(req.body.message, 2500),
      privacy: Boolean(req.body.privacy),
      source: cleanText(req.body.source, 80) || 'website'
    };

    if (!lead.name || (!lead.phone && !lead.email) || !lead.message) {
      return res.status(400).json({ ok: false, error: 'Inserisci nome, almeno un contatto e un messaggio.' });
    }

    const leads = await readJson(LEADS_FILE, []);
    leads.unshift(lead);
    await writeJson(LEADS_FILE, leads.slice(0, 1000));
    broadcastEvent('lead:create', { type: lead.type });

    const content = await readJson(CONTENT_FILE, {});
    let emailResult = { sent: false, skipped: true, error: '' };
    try {
      emailResult = await sendLeadEmail(lead, content);
    } catch (emailError) {
      console.error('Errore invio email:', emailError.message);
      emailResult = { sent: false, skipped: false, error: emailError.message };
    }

    res.json({
      ok: true,
      leadId: lead.id,
      whatsappUrl: buildWhatsAppUrl(content, lead),
      emailSent: emailResult.sent,
      emailSkipped: emailResult.skipped,
      emailError: emailResult.sent ? '' : emailResult.error
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Errore durante il salvataggio della richiesta.' });
  }
});

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 12 }), async (req, res) => {
  const password = String(req.body.password || '');
  if (!(await verifyAdminPassword(password))) {
    return res.status(401).json({ ok: false, error: 'Password errata' });
  }
  const settings = await getSecuritySettings();
  if (settings.twoFactor?.enabled && settings.twoFactor?.secret) {
    return res.json({
      ok: true,
      requires2fa: true,
      tempToken: signPayload({ type: 'admin_2fa', exp: Date.now() + 1000 * 60 * 5 }),
      warning: ''
    });
  }
  res.json({
    ok: true,
    token: signPayload({ type: 'admin', exp: Date.now() + 1000 * 60 * 60 * 8 }),
    warning: ''
  });
});

app.post('/api/admin/2fa/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const payload = verifyPayload(req.body.tempToken);
  if (!payload || payload.type !== 'admin_2fa') return res.status(401).json({ ok: false, error: 'Sessione 2FA scaduta. Accedi di nuovo.' });
  const settings = await getSecuritySettings();
  if (!settings.twoFactor?.enabled || !settings.twoFactor?.secret) return res.status(400).json({ ok: false, error: '2FA non configurata.' });
  if (!verifyTotp(settings.twoFactor.secret, req.body.code)) return res.status(401).json({ ok: false, error: 'Codice 2FA non valido.' });
  res.json({ ok: true, token: signPayload({ type: 'admin', exp: Date.now() + 1000 * 60 * 60 * 8 }) });
});

app.get('/api/admin/security', requireAdmin, async (req, res) => {
  res.json({ ok: true, twoFactor: await getAdmin2faState() });
});

app.post('/api/admin/2fa/setup', requireAdmin, async (req, res) => {
  const settings = await getSecuritySettings();
  const secret = generateBase32Secret(20);
  settings.twoFactor = settings.twoFactor || {};
  settings.twoFactor.pendingSecret = secret;
  settings.twoFactor.pendingAt = new Date().toISOString();
  await writeJson(SECURITY_FILE, settings);
  res.json({ ok: true, secret, otpauth: await adminOtpAuthUri(secret) });
});

app.post('/api/admin/2fa/enable', requireAdmin, async (req, res) => {
  const settings = await getSecuritySettings();
  const secret = settings.twoFactor?.pendingSecret;
  if (!secret) return res.status(400).json({ ok: false, error: 'Prima genera il codice di configurazione 2FA.' });
  if (!verifyTotp(secret, req.body.code)) return res.status(400).json({ ok: false, error: 'Codice 2FA non valido.' });
  settings.twoFactor = { enabled: true, secret, enabledAt: new Date().toISOString() };
  await writeJson(SECURITY_FILE, settings);
  broadcastEvent('security:2fa-enabled', {});
  res.json({ ok: true, twoFactor: await getAdmin2faState() });
});

app.post('/api/admin/2fa/disable', requireAdmin, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const password = String(req.body.currentPassword || '');
  if (!(await verifyAdminPassword(password))) return res.status(400).json({ ok: false, error: 'Password admin non corretta.' });
  const settings = await getSecuritySettings();
  settings.twoFactor = { enabled: false, disabledAt: new Date().toISOString() };
  await writeJson(SECURITY_FILE, settings);
  broadcastEvent('security:2fa-disabled', {});
  res.json({ ok: true, twoFactor: await getAdmin2faState() });
});

app.post('/api/admin/test-email', requireAdmin, rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  const transporter = smtpTransport();
  const content = await readJson(CONTENT_FILE, {});
  const to = cleanText(req.body.to, 180) || process.env.MAIL_TO || content?.contact?.email;
  if (!transporter || !to) return res.status(400).json({ ok: false, error: 'SMTP non configurato o destinatario mancante.' });
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || content?.contact?.email || to;
  await transporter.sendMail({
    from,
    to,
    subject: 'Test email Reitano Automazioni',
    text: `Email di test inviata correttamente il ${new Date().toLocaleString('it-IT')}.`
  });
  res.json({ ok: true, to });
});

app.post('/api/admin/password', requireAdmin, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!(await verifyAdminPassword(currentPassword))) {
    return res.status(400).json({ ok: false, error: 'Password attuale non corretta.' });
  }
  if (newPassword.length < 10) {
    return res.status(400).json({ ok: false, error: 'La nuova password deve avere almeno 10 caratteri.' });
  }
  await setAdminPassword(newPassword);
  let notificationEmail = { sent: false, skipped: true };
  try { notificationEmail = await sendAdminPasswordChangedEmail(); } catch (error) { notificationEmail = { sent: false, skipped: false, error: error.message }; }
  broadcastEvent('security:admin-password-changed', {});
  res.json({ ok: true, changedAt: new Date().toISOString(), notificationEmail });
});

app.post('/api/admin/content', requireAdmin, async (req, res) => {
  try {
    const content = req.body;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return res.status(400).json({ ok: false, error: 'Formato contenuti non valido.' });
    }
    await writeJson(CONTENT_FILE, content);
    broadcastEvent('content:update', { area: 'site' });
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Impossibile salvare i contenuti.' });
  }
});

app.post('/api/admin/reset-site', requireAdmin, async (req, res) => {
  try {
    const current = await readJson(CONTENT_FILE, {});
    const backupFile = path.join(DATA_DIR, `content-backup-${Date.now()}.json`);
    await fsp.writeFile(backupFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    const defaults = await readJson(DEFAULT_CONTENT_FILE, current);
    await writeJson(CONTENT_FILE, defaults);
    broadcastEvent('content:update', { area: 'site', reset: true });
    res.json({ ok: true, backup: path.basename(backupFile), restoredAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Errore durante il reset del sito.' });
  }
});

app.post('/api/admin/reset-theme', requireAdmin, async (req, res) => {
  const content = await readJson(CONTENT_FILE, {});
  const defaults = await readJson(DEFAULT_CONTENT_FILE, {});
  content.theme = defaults.theme || {
    homeBgColor: '#ffffff', surfaceColor: '#ffffff', accentColor: '#111111', headingColor: '#111111', textColor: '#424242',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', baseFontSize: '16px', navFontSize: '16px',
    heroTitleSize: 'clamp(38px, 5.2vw, 72px)', sectionTitleSize: 'clamp(30px, 4.2vw, 54px)', heading3Size: '22px', cardTitleSize: '21px'
  };
  await writeJson(CONTENT_FILE, content);
  broadcastEvent('content:update', { area: 'theme', reset: true });
  res.json({ ok: true, theme: content.theme });
});

app.get('/api/admin/export-content', requireAdmin, async (req, res) => {
  const content = await readJson(CONTENT_FILE, {});
  res.setHeader('Content-Disposition', 'attachment; filename="content-export.json"');
  res.json(content);
});

app.get('/api/admin/leads', requireAdmin, async (req, res) => {
  const leads = await readJson(LEADS_FILE, []);
  res.json({ ok: true, leads });
});

app.delete('/api/admin/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readJson(LEADS_FILE, []);
  const filtered = leads.filter((lead) => lead.id !== req.params.id);
  await writeJson(LEADS_FILE, filtered);
  res.json({ ok: true });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Nessun file caricato.' });
    }
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  });
});

// -----------------------------
// Client app + gestionale interventi/fatture
// -----------------------------

app.post('/api/client/register', async (req, res) => {
  try {
    const name = cleanText(req.body.name, 140);
    const company = cleanText(req.body.company, 180);
    const email = cleanText(req.body.email, 180).toLowerCase();
    const phone = cleanText(req.body.phone, 80);
    const password = String(req.body.password || '');

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Inserisci nome, email e password di almeno 6 caratteri.' });
    }

    const clients = await readJson(CLIENTS_FILE, []);
    if (clients.some((client) => String(client.email).toLowerCase() === email)) {
      return res.status(409).json({ ok: false, error: 'Email già registrata. Accedi oppure usa un’altra email.' });
    }

    const client = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      name,
      company,
      email,
      phone,
      address: cleanText(req.body.address, 220),
      vat: cleanText(req.body.vat, 80),
      notes: '',
      password: hashPassword(password)
    };

    clients.unshift(client);
    await writeJson(CLIENTS_FILE, clients);
    let welcomeEmail = { sent: false, skipped: true };
    try { welcomeEmail = await sendClientWelcomeEmail(client); } catch (emailError) { welcomeEmail = { sent: false, skipped: false, error: emailError.message }; }
    broadcastEvent('client:create', { clientId: client.id });
    res.json({ ok: true, token: clientToken(client), client: publicClient(client), welcomeEmail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Errore durante la registrazione.' });
  }
});

app.post('/api/client/login', async (req, res) => {
  try {
    const email = cleanText(req.body.email, 180).toLowerCase();
    const password = String(req.body.password || '');
    const clients = await readJson(CLIENTS_FILE, []);
    const client = clients.find((item) => String(item.email).toLowerCase() === email && item.status !== 'archived');
    if (!client || !verifyPassword(password, client.password)) {
      return res.status(401).json({ ok: false, error: 'Credenziali non valide.' });
    }
    client.lastLogin = new Date().toISOString();
    client.updatedAt = new Date().toISOString();
    await writeJson(CLIENTS_FILE, clients);
    broadcastEvent('client:create', { clientId: client.id });
    res.json({ ok: true, token: clientToken(client), client: publicClient(client) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Errore durante l’accesso.' });
  }
});

app.post('/api/client/google-login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const google = await verifyGoogleCredential(req.body.credential);
    if (!google.email) return res.status(400).json({ ok: false, error: 'Email Google non disponibile.' });
    const clients = await readJson(CLIENTS_FILE, []);
    let client = clients.find((item) => String(item.email).toLowerCase() === google.email || item.googleId === google.googleId);
    let created = false;
    if (!client) {
      created = true;
      client = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        status: 'active',
        authProvider: 'google',
        googleId: google.googleId,
        picture: google.picture,
        name: cleanText(google.name, 140),
        company: '',
        email: google.email,
        phone: '',
        address: '',
        vat: '',
        notes: 'Registrato tramite account Google',
        password: null
      };
      clients.unshift(client);
    } else {
      client.googleId = client.googleId || google.googleId;
      client.picture = google.picture || client.picture;
      client.authProvider = client.authProvider || 'google';
      client.lastLogin = new Date().toISOString();
      client.updatedAt = new Date().toISOString();
    }
    await writeJson(CLIENTS_FILE, clients);
    if (created) {
      try { await sendClientWelcomeEmail(client); } catch (error) { console.error('Welcome Google:', error.message); }
    }
    broadcastEvent('client:create', { clientId: client.id, provider: 'google' });
    res.json({ ok: true, token: clientToken(client), client: publicClient(client), created });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/client/password-reset/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  const email = cleanText(req.body.email, 180).toLowerCase();
  const phone = cleanText(req.body.phone, 80);
  const clients = await readJson(CLIENTS_FILE, []);
  const client = clients.find((item) =>
    (email && String(item.email).toLowerCase() === email) ||
    (phone && String(item.phone).replace(/\D/g, '') === phone.replace(/\D/g, ''))
  );

  // Risposta volutamente generica per sicurezza.
  if (!client) return res.json({ ok: true, message: 'Se i dati sono corretti riceverai istruzioni di recupero.' });

  client.resetTokens = Array.isArray(client.resetTokens) ? client.resetTokens : [];
  const resetToken = crypto.randomBytes(24).toString('hex');
  client.resetTokens.push({ token: resetToken, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(), used: false });
  client.resetTokens = client.resetTokens.slice(-5);
  client.updatedAt = new Date().toISOString();
  await writeJson(CLIENTS_FILE, clients);

  let emailResult = { sent: false, skipped: true };
  try { emailResult = await sendPasswordResetEmail(client, resetToken); } catch (error) { emailResult = { sent: false, skipped: false, error: error.message }; }
  broadcastEvent('client:password-reset-request', { clientId: client.id, emailSent: emailResult.sent });
  res.json({ ok: true, message: 'Se i dati sono corretti riceverai istruzioni di recupero.', emailSent: emailResult.sent, emailSkipped: emailResult.skipped });
});

app.post('/api/client/password-reset/confirm', rateLimit({ windowMs: 15 * 60 * 1000, max: 8 }), async (req, res) => {
  const email = cleanText(req.body.email, 180).toLowerCase();
  const token = cleanText(req.body.token, 120);
  const newPassword = String(req.body.newPassword || '');
  if (!email || !token || newPassword.length < 6) return res.status(400).json({ ok: false, error: 'Dati recupero non validi.' });
  const clients = await readJson(CLIENTS_FILE, []);
  const client = clients.find((item) => String(item.email).toLowerCase() === email && item.status !== 'archived');
  if (!client) return res.status(400).json({ ok: false, error: 'Token non valido o scaduto.' });
  client.resetTokens = Array.isArray(client.resetTokens) ? client.resetTokens : [];
  const reset = client.resetTokens.find((item) => item.token === token && !item.used);
  if (!reset || Date.now() > new Date(reset.expiresAt).getTime()) return res.status(400).json({ ok: false, error: 'Token non valido o scaduto.' });
  reset.used = true;
  reset.usedAt = new Date().toISOString();
  client.password = hashPassword(newPassword);
  client.updatedAt = new Date().toISOString();
  await writeJson(CLIENTS_FILE, clients);
  let passwordEmail = { sent: false, skipped: true };
  try { passwordEmail = await sendClientPasswordChangedEmail(client, { by: 'recupero password' }); } catch (error) { passwordEmail = { sent: false, skipped: false, error: error.message }; }
  broadcastEvent('client:password-reset-confirmed', { clientId: client.id });
  res.json({ ok: true, passwordEmail });
});

app.post('/api/client/account-recovery/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  const phone = cleanText(req.body.phone, 80);
  const company = cleanText(req.body.company, 180);
  const name = cleanText(req.body.name, 140);
  const leads = await readJson(LEADS_FILE, []);
  leads.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    type: 'account_recovery',
    name,
    company,
    phone,
    email: '',
    service: 'Recupero account cliente',
    message: `Richiesta recupero email/account. Nome: ${name}. Azienda: ${company}. Telefono: ${phone}`,
    status: 'new',
    source: 'client-app'
  });
  await writeJson(LEADS_FILE, leads.slice(0, 1000));
  broadcastEvent('lead:create', { type: 'account_recovery' });
  res.json({ ok: true, message: 'Richiesta inviata. Verrai ricontattato.' });
});

app.get('/api/client/me', requireClient, async (req, res) => {
  res.json({ ok: true, client: publicClient(req.client) });
});

app.patch('/api/client/me', requireClient, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  const index = clients.findIndex((client) => client.id === req.client.id);
  if (index < 0) return res.status(404).json({ ok: false, error: 'Cliente non trovato.' });
  const current = clients[index];
  current.name = cleanText(req.body.name, 140) || current.name;
  current.company = cleanText(req.body.company, 180);
  current.phone = cleanText(req.body.phone, 80);
  current.address = cleanText(req.body.address, 220);
  current.vat = cleanText(req.body.vat, 80);
  current.updatedAt = new Date().toISOString();
  let passwordEmail = { sent: false, skipped: true };
  if (req.body.password && String(req.body.password).length >= 6) {
    current.password = hashPassword(String(req.body.password));
    try { passwordEmail = await sendClientPasswordChangedEmail(current, { by: 'cliente' }); } catch (error) { passwordEmail = { sent: false, skipped: false, error: error.message }; }
  }
  await writeJson(CLIENTS_FILE, clients);
  res.json({ ok: true, client: publicClient(current), passwordEmail });
});

app.get('/api/client/interventions', requireClient, async (req, res) => {
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  res.json({ ok: true, interventions: interventions.filter((item) => item.clientId === req.client.id) });
});

app.post('/api/client/interventions', requireClient, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 180) || cleanText(req.body.service, 180) || 'Nuova richiesta intervento';
    const description = cleanText(req.body.description || req.body.message, 2500);
    if (!description) return res.status(400).json({ ok: false, error: 'Descrivi l’intervento richiesto.' });

    const interventions = await readJson(INTERVENTIONS_FILE, []);
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: req.client.id,
      clientName: req.client.name,
      clientEmail: req.client.email,
      clientPhone: req.client.phone,
      title,
      service: cleanText(req.body.service, 160),
      priority: cleanText(req.body.priority, 50) || 'Normale',
      location: cleanText(req.body.location, 220) || req.client.address || '',
      preferredDate: cleanText(req.body.preferredDate, 80),
      description,
      status: 'requested',
      scheduledAt: '',
      estimatedHours: '',
      publicNotes: 'Richiesta ricevuta. Ti contatteremo per conferma e pianificazione.',
      internalNotes: '',
      costs: { estimate: 0, final: 0 },
      invoiceId: '',
      messages: [
        { id: crypto.randomUUID(), author: 'client', text: description, createdAt: new Date().toISOString() }
      ]
    };
    interventions.unshift(item);
    await writeJson(INTERVENTIONS_FILE, interventions);
    broadcastEvent('intervention:update', { interventionId: item.id, clientId: item.clientId });
    res.json({ ok: true, intervention: item });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Errore durante la creazione della richiesta.' });
  }
});

app.get('/api/client/interventions/:id', requireClient, async (req, res) => {
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const item = interventions.find((intervention) => intervention.id === req.params.id && intervention.clientId === req.client.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Intervento non trovato.' });
  res.json({ ok: true, intervention: item });
});

app.post('/api/client/interventions/:id/messages', requireClient, async (req, res) => {
  const text = cleanText(req.body.text, 1800);
  if (!text) return res.status(400).json({ ok: false, error: 'Scrivi un messaggio.' });
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const item = interventions.find((intervention) => intervention.id === req.params.id && intervention.clientId === req.client.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Intervento non trovato.' });
  item.messages = Array.isArray(item.messages) ? item.messages : [];
  item.messages.push({ id: crypto.randomUUID(), author: 'client', text, createdAt: new Date().toISOString() });
  item.updatedAt = new Date().toISOString();
  await writeJson(INTERVENTIONS_FILE, interventions);
  res.json({ ok: true, intervention: item });
});

app.get('/api/client/invoices', requireClient, async (req, res) => {
  const invoices = await readJson(INVOICES_FILE, []);
  const deadlineState = refreshInvoiceDeadlines(invoices);
  if (deadlineState.changed) await writeJson(INVOICES_FILE, invoices);
  res.json({ ok: true, invoices: invoices.filter((invoice) => invoice.clientId === req.client.id) });
});

app.post('/api/client/reviews', requireClient, rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  const interventionId = cleanText(req.body.interventionId, 120);
  const rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
  const text = cleanText(req.body.text, 1200);
  if (!interventionId || !text) return res.status(400).json({ ok: false, error: 'Seleziona un intervento completato e scrivi la recensione.' });
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const intervention = interventions.find((item) => item.id === interventionId && item.clientId === req.client.id && item.status === 'completed');
  if (!intervention) return res.status(403).json({ ok: false, error: 'Puoi recensire solo interventi completati.' });
  const reviews = await readJson(REVIEWS_FILE, []);
  if (reviews.some((review) => review.interventionId === interventionId && review.clientId === req.client.id)) {
    return res.status(409).json({ ok: false, error: 'Hai già inviato una recensione per questo intervento.' });
  }
  const review = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    clientId: req.client.id,
    clientName: req.client.name,
    company: req.client.company,
    interventionId,
    interventionTitle: intervention.title,
    rating,
    text
  };
  reviews.unshift(review);
  await writeJson(REVIEWS_FILE, reviews);
  broadcastEvent('review:create', { reviewId: review.id, clientId: req.client.id });
  res.json({ ok: true, review });
});

app.get('/api/client/reviews', requireClient, async (req, res) => {
  const reviews = await readJson(REVIEWS_FILE, []);
  res.json({ ok: true, reviews: reviews.filter((review) => review.clientId === req.client.id) });
});

app.get('/api/client/payment-methods', requireClient, async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [] });
  res.json({ ok: true, paymentMethods: (settings.paymentMethods || []).filter((item) => item.enabled !== false) });
});

app.get('/api/client/panels', requireClient, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  res.json({ ok: true, panels: panels.filter((panel) => panel.clientId === req.client.id).map(normalizePanel) });
});

app.get('/api/client/panels/:id', requireClient, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id && item.clientId === req.client.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  res.json({ ok: true, panel: normalizePanel(panel) });
});

app.post('/api/client/panels/:id/commands', requireClient, async (req, res) => {
  const type = cleanText(req.body.type, 60);
  const allowed = ['power_on', 'power_off', 'reset_alarm', 'restart'];
  if (!allowed.includes(type)) return res.status(400).json({ ok: false, error: 'Comando non valido.' });
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id && item.clientId === req.client.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  normalizePanel(panel);
  if (!panel.controlEnabled) return res.status(403).json({ ok: false, error: 'Controllo remoto non abilitato per questo quadro.' });
  const command = {
    id: crypto.randomUUID(),
    type,
    label: ({ power_on: 'Accensione', power_off: 'Spegnimento', reset_alarm: 'Reset allarme', restart: 'Riavvio' })[type],
    source: 'client',
    requestedBy: req.client.name,
    note: cleanText(req.body.note, 500),
    status: panel.controlMode === 'demo' || panel.controlMode === 'manual' ? 'completed' : 'pending',
    createdAt: new Date().toISOString(),
    completedAt: panel.controlMode === 'demo' || panel.controlMode === 'manual' ? new Date().toISOString() : ''
  };
  panel.commands.unshift(command);
  if (command.status === 'completed') applyPanelCommand(panel, command);
  panel.updatedAt = new Date().toISOString();
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:command', { panelId: panel.id, clientId: panel.clientId, commandId: command.id, status: command.status });
  res.json({ ok: true, panel: normalizePanel(panel), command });
});

// Admin gestionale
app.get('/api/admin/crm', requireAdmin, async (req, res) => {
  const [clients, interventions, invoices, settings, panels, content, leads, reviews] = await Promise.all([
    readJson(CLIENTS_FILE, []),
    readJson(INTERVENTIONS_FILE, []),
    readJson(INVOICES_FILE, []),
    readJson(APP_SETTINGS_FILE, { paymentMethods: [] }),
    readJson(PANELS_FILE, []),
    readJson(CONTENT_FILE, {}),
    readJson(LEADS_FILE, []),
    readJson(REVIEWS_FILE, [])
  ]);
  const openStatuses = ['requested', 'scheduled', 'in_progress', 'waiting_parts'];
  const deadlineState = refreshInvoiceDeadlines(invoices);
  const reminderEmailChanged = await processInvoiceReminderEmails(invoices, clients, content);
  if (deadlineState.changed || reminderEmailChanged) await writeJson(INVOICES_FILE, invoices);
  res.json({
    ok: true,
    clients: clients.map(publicClient),
    interventions,
    invoices,
    leads,
    reviews,
    deadlines: deadlineState.deadlines,
    panels: panels.map(normalizePanel),
    projects: content.projects || [],
    paymentMethods: settings.paymentMethods || [],
    stats: {
      clients: clients.length,
      pendingReviews: reviews.filter((review) => review.status === 'pending').length,
      websiteRequests: leads.filter((lead) => lead.status !== 'converted' && lead.status !== 'archived').length,
      paymentDeadlines: deadlineState.deadlines.length,
      openInterventions: interventions.filter((item) => openStatuses.includes(item.status)).length,
      completedInterventions: interventions.filter((item) => item.status === 'completed').length,
      panels: panels.length,
      panelsOnline: panels.filter((panel) => panel.status === 'online').length,
      panelsAlarm: panels.filter((panel) => panel.status === 'alarm' || (panel.signals || []).some((signal) => signal.status === 'alarm')).length,
      unpaidInvoices: invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').length,
      unpaidAmount: invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').reduce((sum, invoice) => sum + money(invoice.totals?.total), 0)
    }
  });
});

app.get('/api/admin/crm/leads', requireAdmin, async (req, res) => {
  const leads = await readJson(LEADS_FILE, []);
  res.json({ ok: true, leads });
});

app.patch('/api/admin/crm/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readJson(LEADS_FILE, []);
  const lead = leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: 'Richiesta non trovata.' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) lead.status = cleanText(req.body.status, 40);
  if (Object.prototype.hasOwnProperty.call(req.body, 'adminNotes')) lead.adminNotes = cleanText(req.body.adminNotes, 1200);
  lead.updatedAt = new Date().toISOString();
  await writeJson(LEADS_FILE, leads);
  broadcastEvent('lead:update', { leadId: lead.id, status: lead.status });
  res.json({ ok: true, lead });
});

app.post('/api/admin/crm/leads/:id/convert', requireAdmin, async (req, res) => {
  const [leads, clients, interventions] = await Promise.all([
    readJson(LEADS_FILE, []),
    readJson(CLIENTS_FILE, []),
    readJson(INTERVENTIONS_FILE, [])
  ]);
  const lead = leads.find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: 'Richiesta non trovata.' });

  const email = cleanText(lead.email, 180).toLowerCase();
  let client = clients.find((item) => email && String(item.email).toLowerCase() === email);
  let tempPassword = '';
  if (!client) {
    tempPassword = crypto.randomBytes(4).toString('hex');
    client = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      name: cleanText(lead.name, 140) || 'Cliente da richiesta',
      company: cleanText(lead.company, 180),
      email: email || `cliente-${Date.now()}@da-completare.local`,
      phone: cleanText(lead.phone, 80),
      address: cleanText(lead.location, 220),
      vat: '',
      notes: `Creato da richiesta sito del ${lead.createdAt || new Date().toISOString()}`,
      password: hashPassword(tempPassword)
    };
    clients.unshift(client);
  }

  const intervention = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    title: cleanText(req.body.title, 180) || cleanText(lead.service, 160) || 'Richiesta dal sito',
    service: cleanText(lead.service, 160),
    priority: cleanText(lead.timeframe, 80) || 'Da valutare',
    location: cleanText(lead.location, 220),
    preferredDate: '',
    description: cleanText(lead.message, 2500),
    status: cleanText(req.body.status, 60) || 'requested',
    scheduledAt: '',
    estimatedHours: '',
    publicNotes: 'Richiesta convertita dal sito. Ti contatteremo per aggiornamenti.',
    internalNotes: `Lead originale: ${lead.id}`,
    costs: { estimate: 0, final: 0 },
    invoiceId: '',
    messages: [
      { id: crypto.randomUUID(), author: 'client', text: cleanText(lead.message, 1800), createdAt: lead.createdAt || new Date().toISOString() }
    ]
  };
  interventions.unshift(intervention);
  lead.status = 'converted';
  lead.convertedAt = new Date().toISOString();
  lead.clientId = client.id;
  lead.interventionId = intervention.id;
  await Promise.all([
    writeJson(CLIENTS_FILE, clients),
    writeJson(INTERVENTIONS_FILE, interventions),
    writeJson(LEADS_FILE, leads)
  ]);
  if (tempPassword) {
    try { await sendClientWelcomeEmail(client, tempPassword); } catch (error) { console.error('Welcome email conversione:', error.message); }
  }
  broadcastEvent('lead:converted', { leadId: lead.id, clientId: client.id, interventionId: intervention.id });
  broadcastEvent('intervention:update', { interventionId: intervention.id, clientId: client.id });
  res.json({ ok: true, client: publicClient(client), intervention, tempPassword });
});

app.get('/api/admin/crm/reviews', requireAdmin, async (req, res) => {
  const reviews = await readJson(REVIEWS_FILE, []);
  res.json({ ok: true, reviews });
});

app.patch('/api/admin/crm/reviews/:id', requireAdmin, async (req, res) => {
  const reviews = await readJson(REVIEWS_FILE, []);
  const review = reviews.find((item) => item.id === req.params.id);
  if (!review) return res.status(404).json({ ok: false, error: 'Recensione non trovata.' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) review.status = cleanText(req.body.status, 40);
  if (Object.prototype.hasOwnProperty.call(req.body, 'text')) review.text = cleanText(req.body.text, 1200);
  review.updatedAt = new Date().toISOString();
  await writeJson(REVIEWS_FILE, reviews);
  broadcastEvent('review:update', { reviewId: review.id, status: review.status });
  res.json({ ok: true, review });
});

app.get('/api/admin/crm/panels', requireAdmin, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  res.json({ ok: true, panels: panels.map(normalizePanel) });
});

app.post('/api/admin/crm/panels', requireAdmin, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const content = await readJson(CONTENT_FILE, {});
  const client = clients.find((item) => item.id === req.body.clientId);
  if (!client) return res.status(400).json({ ok: false, error: 'Cliente non valido.' });
  const intervention = interventions.find((item) => item.id === req.body.interventionId);
  const project = (content.projects || []).find((item) => item.slug === req.body.projectSlug);
  const panels = await readJson(PANELS_FILE, []);
  const panel = normalizePanel({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    interventionId: intervention?.id || '',
    interventionTitle: intervention?.title || '',
    projectSlug: cleanText(req.body.projectSlug, 160),
    projectTitle: project?.title || cleanText(req.body.projectTitle, 180),
    name: cleanText(req.body.name, 180) || 'Quadro elettrico',
    code: cleanText(req.body.code, 80) || `Q-${String(panels.length + 1).padStart(3, '0')}`,
    location: cleanText(req.body.location, 220),
    description: cleanText(req.body.description, 1800),
    status: cleanText(req.body.status, 60) || 'offline',
    powerState: cleanText(req.body.powerState, 40) || 'off',
    controlEnabled: req.body.controlEnabled === true || req.body.controlEnabled === 'true' || req.body.controlEnabled === 'on',
    controlMode: cleanText(req.body.controlMode, 60) || 'manual',
    lastSeen: '',
    signals: parseSignals(req.body.signals || req.body.signalsText),
    history: [],
    alarms: [],
    commands: []
  });
  panels.unshift(panel);
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:update', { panelId: panel.id, clientId: panel.clientId });
  res.json({ ok: true, panel });
});

app.patch('/api/admin/crm/panels/:id', requireAdmin, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  normalizePanel(panel);
  ['name', 'code', 'location', 'description', 'status', 'powerState', 'controlMode', 'projectSlug', 'projectTitle', 'interventionId', 'interventionTitle'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) panel[field] = cleanText(req.body[field], field === 'description' ? 1800 : 220);
  });
  if (Object.prototype.hasOwnProperty.call(req.body, 'controlEnabled')) panel.controlEnabled = Boolean(req.body.controlEnabled === true || req.body.controlEnabled === 'true' || req.body.controlEnabled === 'on');
  if (Object.prototype.hasOwnProperty.call(req.body, 'signals') || Object.prototype.hasOwnProperty.call(req.body, 'signalsText')) panel.signals = parseSignals(req.body.signals || req.body.signalsText);
  panel.updatedAt = new Date().toISOString();
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:update', { panelId: panel.id, clientId: panel.clientId });
  res.json({ ok: true, panel });
});

app.post('/api/admin/crm/panels/:id/telemetry', requireAdmin, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  normalizePanel(panel);
  let readings = req.body.readings;
  if (!readings || typeof readings !== 'object') {
    readings = {};
    String(req.body.readingsText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [name, value] = line.split('|').map((part) => part.trim());
        if (name) readings[name] = value || '';
      });
  }
  updatePanelSignals(panel, readings);
  panel.status = cleanText(req.body.status, 60) || panel.status || 'online';
  panel.powerState = cleanText(req.body.powerState, 40) || panel.powerState || 'on';
  panel.updatedAt = new Date().toISOString();
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:update', { panelId: panel.id, clientId: panel.clientId });
  res.json({ ok: true, panel });
});

app.post('/api/admin/crm/panels/:id/commands', requireAdmin, async (req, res) => {
  const type = cleanText(req.body.type, 60);
  const allowed = ['power_on', 'power_off', 'reset_alarm', 'restart'];
  if (!allowed.includes(type)) return res.status(400).json({ ok: false, error: 'Comando non valido.' });
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  normalizePanel(panel);
  const command = {
    id: crypto.randomUUID(),
    type,
    label: ({ power_on: 'Accensione', power_off: 'Spegnimento', reset_alarm: 'Reset allarme', restart: 'Riavvio' })[type],
    source: 'admin',
    requestedBy: 'Admin',
    note: cleanText(req.body.note, 500),
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
  panel.commands.unshift(command);
  applyPanelCommand(panel, command);
  panel.updatedAt = new Date().toISOString();
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:command', { panelId: panel.id, clientId: panel.clientId, commandId: command.id, status: command.status });
  res.json({ ok: true, panel, command });
});

app.patch('/api/admin/crm/panels/:id/commands/:commandId', requireAdmin, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  const panel = panels.find((item) => item.id === req.params.id);
  if (!panel) return res.status(404).json({ ok: false, error: 'Quadro non trovato.' });
  normalizePanel(panel);
  const command = panel.commands.find((item) => item.id === req.params.commandId);
  if (!command) return res.status(404).json({ ok: false, error: 'Comando non trovato.' });
  command.status = cleanText(req.body.status, 60) || 'completed';
  command.completedAt = command.status === 'completed' ? new Date().toISOString() : '';
  if (command.status === 'completed') applyPanelCommand(panel, command);
  panel.updatedAt = new Date().toISOString();
  await writeJson(PANELS_FILE, panels);
  broadcastEvent('panel:command', { panelId: panel.id, clientId: panel.clientId, commandId: command.id, status: command.status });
  res.json({ ok: true, panel, command });
});

app.delete('/api/admin/crm/panels/:id', requireAdmin, async (req, res) => {
  const panels = await readJson(PANELS_FILE, []);
  await writeJson(PANELS_FILE, panels.filter((panel) => panel.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/crm/clients', requireAdmin, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  res.json({ ok: true, clients: clients.map(publicClient) });
});

app.post('/api/admin/crm/clients', requireAdmin, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  const email = cleanText(req.body.email, 180).toLowerCase();
  const name = cleanText(req.body.name, 140);
  if (!name || !email) return res.status(400).json({ ok: false, error: 'Nome ed email sono obbligatori.' });
  if (clients.some((client) => String(client.email).toLowerCase() === email)) {
    return res.status(409).json({ ok: false, error: 'Email già presente.' });
  }
  const tempPassword = cleanText(req.body.password, 80) || crypto.randomBytes(4).toString('hex');
  const client = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: cleanText(req.body.status, 40) || 'active',
    name,
    company: cleanText(req.body.company, 180),
    email,
    phone: cleanText(req.body.phone, 80),
    address: cleanText(req.body.address, 220),
    vat: cleanText(req.body.vat, 80),
    notes: cleanText(req.body.notes, 1000),
    password: hashPassword(tempPassword)
  };
  clients.unshift(client);
  await writeJson(CLIENTS_FILE, clients);
  let welcomeEmail = { sent: false, skipped: true };
  try { welcomeEmail = await sendClientWelcomeEmail(client, tempPassword); } catch (error) { welcomeEmail = { sent: false, skipped: false, error: error.message }; }
  broadcastEvent('client:create', { clientId: client.id });
  res.json({ ok: true, client: publicClient(client), tempPassword, welcomeEmail });
});

app.patch('/api/admin/crm/clients/:id', requireAdmin, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  const client = clients.find((item) => item.id === req.params.id);
  if (!client) return res.status(404).json({ ok: false, error: 'Cliente non trovato.' });
  ['name', 'company', 'email', 'phone', 'address', 'vat', 'notes', 'status'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) client[field] = cleanText(req.body[field], field === 'notes' ? 1000 : 220);
  });
  let passwordEmail = { sent: false, skipped: true };
  if (req.body.password && String(req.body.password).length >= 6) {
    client.password = hashPassword(String(req.body.password));
    try { passwordEmail = await sendClientPasswordChangedEmail(client, { by: 'amministratore', tempPassword: String(req.body.password) }); } catch (error) { passwordEmail = { sent: false, skipped: false, error: error.message }; }
  }
  client.email = String(client.email || '').toLowerCase();
  client.updatedAt = new Date().toISOString();
  await writeJson(CLIENTS_FILE, clients);
  res.json({ ok: true, client: publicClient(client), passwordEmail });
});

app.get('/api/admin/crm/interventions', requireAdmin, async (req, res) => {
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  res.json({ ok: true, interventions });
});

app.post('/api/admin/crm/interventions', requireAdmin, async (req, res) => {
  const clients = await readJson(CLIENTS_FILE, []);
  const client = clients.find((item) => item.id === req.body.clientId);
  if (!client) return res.status(400).json({ ok: false, error: 'Seleziona un cliente valido.' });
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    title: cleanText(req.body.title, 180) || 'Intervento',
    service: cleanText(req.body.service, 160),
    priority: cleanText(req.body.priority, 50) || 'Normale',
    location: cleanText(req.body.location, 220),
    preferredDate: cleanText(req.body.preferredDate, 80),
    description: cleanText(req.body.description, 2500),
    status: cleanText(req.body.status, 60) || 'scheduled',
    scheduledAt: cleanText(req.body.scheduledAt, 80),
    estimatedHours: cleanText(req.body.estimatedHours, 40),
    publicNotes: cleanText(req.body.publicNotes, 1200),
    internalNotes: cleanText(req.body.internalNotes, 1600),
    costs: { estimate: money(req.body.estimate), final: money(req.body.final) },
    invoiceId: '',
    messages: []
  };
  interventions.unshift(item);
  await writeJson(INTERVENTIONS_FILE, interventions);
  res.json({ ok: true, intervention: item });
});

app.patch('/api/admin/crm/interventions/:id', requireAdmin, async (req, res) => {
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const item = interventions.find((intervention) => intervention.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Intervento non trovato.' });
  ['title', 'service', 'priority', 'location', 'preferredDate', 'description', 'status', 'scheduledAt', 'estimatedHours', 'publicNotes', 'internalNotes', 'invoiceId'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) item[field] = cleanText(req.body[field], field === 'description' || field.includes('Notes') ? 2500 : 220);
  });
  if (Object.prototype.hasOwnProperty.call(req.body, 'estimate') || Object.prototype.hasOwnProperty.call(req.body, 'final')) {
    item.costs = item.costs || {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'estimate')) item.costs.estimate = money(req.body.estimate);
    if (Object.prototype.hasOwnProperty.call(req.body, 'final')) item.costs.final = money(req.body.final);
  }
  item.updatedAt = new Date().toISOString();
  await writeJson(INTERVENTIONS_FILE, interventions);
  res.json({ ok: true, intervention: item });
});

app.post('/api/admin/crm/interventions/:id/messages', requireAdmin, async (req, res) => {
  const text = cleanText(req.body.text, 1800);
  if (!text) return res.status(400).json({ ok: false, error: 'Scrivi un messaggio.' });
  const interventions = await readJson(INTERVENTIONS_FILE, []);
  const item = interventions.find((intervention) => intervention.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Intervento non trovato.' });
  item.messages = Array.isArray(item.messages) ? item.messages : [];
  item.messages.push({ id: crypto.randomUUID(), author: 'admin', text, createdAt: new Date().toISOString() });
  item.updatedAt = new Date().toISOString();
  await writeJson(INTERVENTIONS_FILE, interventions);
  res.json({ ok: true, intervention: item });
});

app.get('/api/admin/crm/invoices', requireAdmin, async (req, res) => {
  const invoices = await readJson(INVOICES_FILE, []);
  res.json({ ok: true, invoices });
});

app.post('/api/admin/crm/invoices', requireAdmin, async (req, res) => {
  const [clients, interventions, invoices] = await Promise.all([
    readJson(CLIENTS_FILE, []),
    readJson(INTERVENTIONS_FILE, []),
    readJson(INVOICES_FILE, [])
  ]);
  const client = clients.find((item) => item.id === req.body.clientId);
  if (!client) return res.status(400).json({ ok: false, error: 'Cliente non valido.' });
  const items = parseInvoiceItems(req.body.items || req.body.itemsText);
  if (!items.length) return res.status(400).json({ ok: false, error: 'Inserisci almeno una voce fattura.' });
  const invoice = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    number: cleanText(req.body.number, 80) || nextInvoiceNumber(invoices),
    dueDate: cleanText(req.body.dueDate, 80),
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    interventionId: cleanText(req.body.interventionId, 120),
    status: cleanText(req.body.status, 40) || 'draft',
    currency: 'EUR',
    items,
    notes: cleanText(req.body.notes, 1200),
    paymentMethodId: cleanText(req.body.paymentMethodId, 120),
    paymentType: cleanText(req.body.paymentType, 80) || 'Bonifico',
    reminderDays: cleanText(req.body.reminderDays, 20) || '7,3,0',
    reminders: [],
    totals: invoiceTotals(items),
    paidAt: ''
  };
  invoice.dueInfo = invoiceDueInfo(invoice);
  invoices.unshift(invoice);
  refreshInvoiceDeadlines(invoices);
  await writeJson(INVOICES_FILE, invoices);
  if (invoice.interventionId) {
    const intervention = interventions.find((item) => item.id === invoice.interventionId);
    if (intervention) {
      intervention.invoiceId = invoice.id;
      intervention.updatedAt = new Date().toISOString();
      await writeJson(INTERVENTIONS_FILE, interventions);
    }
  }
  res.json({ ok: true, invoice });
});

app.patch('/api/admin/crm/invoices/:id', requireAdmin, async (req, res) => {
  const invoices = await readJson(INVOICES_FILE, []);
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ ok: false, error: 'Fattura non trovata.' });
  ['number', 'dueDate', 'status', 'notes', 'paymentMethodId', 'paymentType', 'reminderDays'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) invoice[field] = cleanText(req.body[field], field === 'notes' ? 1200 : 120);
  });
  if (req.body.items || req.body.itemsText) {
    invoice.items = parseInvoiceItems(req.body.items || req.body.itemsText);
    invoice.totals = invoiceTotals(invoice.items);
  }
  if (invoice.status === 'paid' && !invoice.paidAt) invoice.paidAt = new Date().toISOString();
  if (invoice.status !== 'paid') invoice.paidAt = '';
  invoice.updatedAt = new Date().toISOString();
  refreshInvoiceDeadlines(invoices);
  await writeJson(INVOICES_FILE, invoices);
  broadcastEvent('invoice:update', { invoiceId: invoice.id, clientId: invoice.clientId });
  res.json({ ok: true, invoice });
});

app.delete('/api/admin/crm/invoices/:id', requireAdmin, async (req, res) => {
  const invoices = await readJson(INVOICES_FILE, []);
  await writeJson(INVOICES_FILE, invoices.filter((invoice) => invoice.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/crm/payment-methods', requireAdmin, async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [] });
  res.json({ ok: true, paymentMethods: settings.paymentMethods || [] });
});

app.post('/api/admin/crm/payment-methods', requireAdmin, async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [] });
  settings.paymentMethods = settings.paymentMethods || [];
  const method = {
    id: crypto.randomUUID(),
    name: cleanText(req.body.name, 120) || 'Metodo pagamento',
    type: cleanText(req.body.type, 80) || 'custom',
    details: cleanText(req.body.details, 1200),
    enabled: req.body.enabled !== false
  };
  settings.paymentMethods.unshift(method);
  await writeJson(APP_SETTINGS_FILE, settings);
  res.json({ ok: true, paymentMethod: method });
});

app.patch('/api/admin/crm/payment-methods/:id', requireAdmin, async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [] });
  const method = (settings.paymentMethods || []).find((item) => item.id === req.params.id);
  if (!method) return res.status(404).json({ ok: false, error: 'Metodo pagamento non trovato.' });
  ['name', 'type', 'details'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) method[field] = cleanText(req.body[field], field === 'details' ? 1200 : 120);
  });
  if (Object.prototype.hasOwnProperty.call(req.body, 'enabled')) method.enabled = Boolean(req.body.enabled);
  await writeJson(APP_SETTINGS_FILE, settings);
  res.json({ ok: true, paymentMethod: method });
});

app.delete('/api/admin/crm/payment-methods/:id', requireAdmin, async (req, res) => {
  const settings = await readJson(APP_SETTINGS_FILE, { paymentMethods: [] });
  settings.paymentMethods = (settings.paymentMethods || []).filter((item) => item.id !== req.params.id);
  await writeJson(APP_SETTINGS_FILE, settings);
  res.json({ ok: true });
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'app.html'));
});

app.get('/admin-app', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin-app.html'));
});

app.get('/local-admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin-app.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function xmlEscape(value) {
  return htmlEscape(value).replace(/&#039;/g, '&apos;');
}

function projectSlug(project) {
  return String(project?.slug || project?.title || 'lavoro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lavoro';
}

function absolutePublicUrl(value, fallback = '/') {
  const raw = String(value || fallback);
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.automazionireitano.it${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function renderWorkPage(template, content, project) {
  const brand = content.brand || {};
  const contact = content.contact || {};
  const slug = projectSlug(project);
  const canonical = `https://www.automazionireitano.it/lavori/${encodeURIComponent(slug)}`;
  const title = `${project.title} | ${brand.shortName || 'Reitano Automazioni'}`;
  const description = project.description || content.seo?.description || 'Automazione industriale, quadri elettrici e service.';
  const image = absolutePublicUrl(project.image, '/logo-brand.png');
  const gallery = [project.image, ...(Array.isArray(project.gallery) ? project.gallery : [])].filter(Boolean);
  const bullets = Array.isArray(project.bullets) ? project.bullets : [];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    description,
    url: canonical,
    image,
    creator: {
      '@type': 'LocalBusiness',
      name: brand.name || 'Reitano Automazioni Industriali & Service',
      telephone: contact.phone || undefined,
      email: contact.email || undefined,
      vatID: contact.vatNumber ? `IT${contact.vatNumber}` : 'IT03365930803',
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'REA',
        value: contact.rea || 'RC-227010'
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: contact.address || 'Via Garibaldi 200',
        addressLocality: 'Gioia Tauro',
        addressRegion: 'RC',
        postalCode: contact.postalCode || '89013',
        addressCountry: 'IT'
      },
      url: 'https://www.automazionireitano.it/'
    }
  };
  const head = `
  <link rel="canonical" href="${htmlEscape(canonical)}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="it_IT">
  <meta property="og:site_name" content="${htmlEscape(brand.name || 'Reitano Automazioni')}">
  <meta property="og:title" content="${htmlEscape(title)}">
  <meta property="og:description" content="${htmlEscape(description)}">
  <meta property="og:url" content="${htmlEscape(canonical)}">
  <meta property="og:image" content="${htmlEscape(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  const body = `
      <a class="back-link" href="/#lavori">← Torna a tutti i lavori</a>
      <section class="detail-hero reveal visible">
        <div class="detail-cover"><img src="${htmlEscape(project.image || '/img/project-automazione.svg')}" alt="${htmlEscape(project.title)}" width="1200" height="800"></div>
        <article class="detail-card">
          <div>
            <p class="eyebrow">${htmlEscape(project.category || 'Lavoro')}</p>
            <h1>${htmlEscape(project.title)}</h1>
            <p class="detail-description">${htmlEscape(description)}</p>
            <div class="detail-meta-grid">
              <div class="detail-meta"><span>Zona</span><strong>${htmlEscape(project.location || contact.city || 'Calabria')}</strong></div>
              <div class="detail-meta"><span>Anno</span><strong>${htmlEscape(project.year || '')}</strong></div>
              <div class="detail-meta"><span>Categoria</span><strong>${htmlEscape(project.category || 'Automazione industriale')}</strong></div>
            </div>
          </div>
          <div class="hero-actions"><a class="btn" href="/#contatti">Richiedi un lavoro simile</a></div>
        </article>
      </section>
      <section class="detail-content-grid reveal visible">
        <article class="detail-section-card"><p class="eyebrow">Dettagli</p><h2>Descrizione intervento</h2><p>${htmlEscape(project.detailedDescription || description)}</p></article>
        <aside class="detail-section-card"><p class="eyebrow">Attività</p><h2>Cosa è stato gestito</h2><ul class="clean-list">${(bullets.length ? bullets : ['Analisi tecnica', 'Intervento operativo', 'Collaudo finale']).map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul></aside>
      </section>
      <section class="reveal visible" style="margin-top:44px"><div class="section-head"><div><p class="eyebrow">Gallery</p><h2>Immagini del lavoro</h2></div></div><div class="detail-gallery">${gallery.map((item, index) => `<a href="${htmlEscape(item)}" target="_blank" rel="noopener"><img src="${htmlEscape(item)}" alt="${htmlEscape(project.title)} - immagine ${index + 1}" loading="lazy"></a>`).join('')}</div></section>`;

  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${htmlEscape(description)}">`)
    .replace('</head>', `${head}\n</head>`)
    .replace(/<div class="container" id="work-detail">[\s\S]*?<\/div>\s*<\/main>/i, `<div class="container" id="work-detail">${body}</div>\n  </main>`);
}

app.get('/sitemap.xml', async (req, res) => {
  const content = await readJson(CONTENT_FILE, {});
  const projects = Array.isArray(content.projects) ? content.projects : [];
  const urls = [
    { loc: 'https://www.automazionireitano.it/', priority: '1.0', changefreq: 'weekly' },
    { loc: 'https://www.automazionireitano.it/servizi', priority: '0.9', changefreq: 'monthly' },
    { loc: 'https://www.automazionireitano.it/servizi/programmazione-plc', priority: '0.8', changefreq: 'monthly' },
    { loc: 'https://www.automazionireitano.it/servizi/impianti-elettrici-industriali', priority: '0.8', changefreq: 'monthly' },
    { loc: 'https://www.automazionireitano.it/servizi/quadri-elettrici', priority: '0.8', changefreq: 'monthly' },
    { loc: 'https://www.automazionireitano.it/servizi/rifacimenti-revamping', priority: '0.8', changefreq: 'monthly' },
    ...projects.map((project) => ({
      loc: `https://www.automazionireitano.it/lavori/${encodeURIComponent(projectSlug(project))}`,
      priority: '0.7',
      changefreq: 'monthly'
    }))
  ];
  const contentStat = await fsp.stat(CONTENT_FILE).catch(() => null);
  const lastmod = (contentStat?.mtime || new Date()).toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${xmlEscape(url.loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
  res.type('application/xml').send(xml);
});

app.get('/servizi', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'servizi.html'));
});

app.get('/servizi/programmazione-plc', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'servizio-plc.html'));
});

app.get('/servizi/impianti-elettrici-industriali', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'servizio-impianti-elettrici.html'));
});

app.get('/servizi/quadri-elettrici', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'servizio-quadri-elettrici.html'));
});

app.get('/servizi/rifacimenti-revamping', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'servizio-rifacimenti-revamping.html'));
});

app.get('/lavori/:slug', async (req, res) => {
  const [content, template] = await Promise.all([
    readJson(CONTENT_FILE, {}),
    fsp.readFile(path.join(PUBLIC_DIR, 'work.html'), 'utf8')
  ]);
  const project = (Array.isArray(content.projects) ? content.projects : [])
    .find((item) => projectSlug(item) === req.params.slug);
  if (!project) {
    const notFound = template
      .replace(/<title>[\s\S]*?<\/title>/i, '<title>Lavoro non trovato | Reitano Automazioni</title>')
      .replace('</head>', '<meta name="robots" content="noindex,follow">\n</head>')
      .replace(/<div class="container" id="work-detail">[\s\S]*?<\/div>\s*<\/main>/i, '<div class="container" id="work-detail"><section class="not-found"><p class="eyebrow">Pagina non trovata</p><h1>Questo lavoro non è disponibile.</h1><p>Puoi tornare al portfolio o richiedere informazioni su un intervento simile.</p><div class="hero-actions"><a class="btn" href="/#lavori">Torna ai lavori</a><a class="btn btn-soft" href="/#contatti">Contatti</a></div></section></div></main>');
    return res.status(404).send(notFound);
  }
  res.send(renderWorkPage(template, content, project));
});

app.use(express.static(PUBLIC_DIR, {
  maxAge: '1h',
  etag: true,
  setHeaders: (res, filePath) => {
    const normalizedPath = filePath.replaceAll('\\', '/');
    if (normalizedPath.endsWith('.html') || normalizedPath.endsWith('/service-worker.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    if (normalizedPath.endsWith('/js/app.js') || normalizedPath.endsWith('/css/style.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`\nReitano Automazioni Industriali & Service`);
  console.log(`Sito:  http://localhost:${PORT}`);
  console.log(`Editor sito:      http://localhost:${PORT}/admin`);
  console.log(`Local admin CRM:  http://localhost:${PORT}/local-admin`);
  console.log(`Gestionale admin: http://localhost:${PORT}/admin-app`);
  console.log(`Password admin: ${ADMIN_PASSWORD === 'cambia-subito' ? 'password predefinita attiva (cambiala da /admin > Sicurezza)' : 'impostata'}`);
  console.log(`Email form: ${process.env.SMTP_HOST ? 'SMTP configurato' : 'SMTP non configurato - richieste salvate solo in admin'}`);
});

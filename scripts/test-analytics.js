const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function browser({ consent = false, internal = false } = {}) {
  const storage = new Map(internal ? [['reitano_internal_traffic', '1']] : []);
  const listeners = {};
  const scripts = [];
  const window = { location: { origin: 'https://example.test', pathname: '/configuratore' }, dispatchEvent() {} };
  const document = {
    cookie: `reitano_cookie_consent=${encodeURIComponent(JSON.stringify({ version: '1.0', marketing: consent }))}`,
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: element => scripts.push(element) },
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  const context = { window, document, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, CustomEvent: class {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/cookie-consent.js'), 'utf8'), context);
  listeners.DOMContentLoaded();
  return { window, scripts, events: () => (window.dataLayer || []).filter(entry => entry[0] === 'event') };
}

test('no analytics without consent', () => {
  const b = browser();
  b.window.reitanoTrackEvent('generate_lead');
  assert.equal(b.events().length, 0);
  assert.equal(b.scripts.filter(s => s.src).length, 0);
});

test('lead uses gtag event command with technical metadata only', () => {
  const b = browser({ consent: true });
  b.window.reitanoTrackEvent('generate_lead', { form_name: 'guided_configurator' });
  assert.equal(b.events().length, 1);
  assert.equal(b.events()[0][1], 'generate_lead');
  assert.equal(b.events()[0][2].page_location, 'https://example.test/configuratore');
});

test('internal exclusion prevents loading, persists and is reversible', () => {
  const b = browser({ consent: true, internal: true });
  assert.equal(b.scripts.filter(s => s.src).length, 0);
  b.window.reitanoTrackEvent('phone_click');
  assert.equal(b.events().length, 0);
  b.window.reitanoSetInternalTraffic(false);
  b.window.reitanoTrackEvent('phone_click');
  assert.equal(b.events().length, 1);
  b.window.reitanoSetInternalTraffic(true);
  b.window.reitanoTrackEvent('phone_click');
  assert.equal(b.events().length, 1);
  assert.equal(b.window['ga-disable-G-8Y44XGZWPC'], true);
});

test('revoking consent disables already loaded analytics', () => {
  const b = browser({ consent: true });
  b.window.reitanoCookieConsent = { marketing: false };
  b.window.reitanoSetInternalTraffic(false);
  b.window.reitanoTrackEvent('generate_lead');
  assert.equal(b.events().length, 0);
  assert.equal(b.window['ga-disable-G-8Y44XGZWPC'], true);
  assert.ok(b.window.dataLayer.some(entry => entry[0] === 'consent' && entry[1] === 'update' && entry[2].analytics_storage === 'denied'));
});

test('configurator emits a lead only after successful server response', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/configurator.js'), 'utf8');
  assert.ok(source.indexOf("window.reitanoTrackEvent?.('generate_lead'") > source.indexOf('if (!response.ok || !data.ok) throw'));
  assert.ok(!source.includes('dataLayer?.push'));
});

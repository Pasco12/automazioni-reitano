(() => {
  const COOKIE_NAME = 'reitano_cookie_consent';
  const VERSION = '1.0';
  const GA_ID = 'G-8Y44XGZWPC';
  let analyticsLoaded = false;

  function getCookie(name) {
    return document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))?.split('=')[1] || '';
  }

  function setCookie(value) {
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    localStorage.setItem(COOKIE_NAME, JSON.stringify(value));
  }

  function getConsent() {
    try {
      const raw = getCookie(COOKIE_NAME) || localStorage.getItem(COOKIE_NAME);
      return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
      return null;
    }
  }

  function apply(consent) {
    window.reitanoCookieConsent = consent;
    if (consent?.marketing) loadAnalytics();
    window.dispatchEvent(new CustomEvent('reitano:cookie-consent', { detail: consent }));
  }

  function loadAnalytics() {
    if (analyticsLoaded || document.querySelector(`script[data-ga-id="${GA_ID}"]`)) return;
    analyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    const script = document.createElement('script');
    script.async = true;
    script.dataset.gaId = GA_ID;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);
  }

  function save(consent) {
    const payload = { version: VERSION, savedAt: new Date().toISOString(), ...consent };
    setCookie(payload);
    apply(payload);
    document.querySelector('.cookie-banner')?.remove();
    document.querySelector('.cookie-modal')?.remove();
  }

  function style() {
    if (document.getElementById('cookie-style')) return;
    const css = document.createElement('style');
    css.id = 'cookie-style';
    css.textContent = `
      .cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:980px;margin:auto;padding:18px;border:1px solid #e5e7eb;border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 24px 80px rgba(0,0,0,.16);backdrop-filter:blur(16px);font-family:Inter,system-ui,sans-serif;color:#111}
      .cookie-banner h3{margin:0 0 8px;font-size:20px;letter-spacing:-.03em}.cookie-banner p{margin:0;color:#555;line-height:1.45}.cookie-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.cookie-actions button,.cookie-actions a{border:1px solid #e5e7eb;border-radius:999px;background:#fff;color:#111;font-weight:850;padding:10px 14px;text-decoration:none;cursor:pointer}.cookie-actions .primary{background:#111;color:#fff;border-color:#111}.cookie-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.36);display:grid;place-items:center;padding:16px}.cookie-box{width:min(100%,560px);background:#fff;border-radius:24px;border:1px solid #e5e7eb;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.18);font-family:Inter,system-ui,sans-serif;color:#111}.cookie-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid #f0f0f0}.cookie-row:last-child{border-bottom:0}.cookie-row strong{display:block}.cookie-row small{display:block;color:#666;margin-top:4px}.cookie-row input{width:22px;height:22px;accent-color:#111}@media(max-width:560px){.cookie-banner{left:10px;right:10px;bottom:10px}.cookie-actions button,.cookie-actions a{width:100%;text-align:center}.cookie-row{align-items:center}}
    `;
    document.head.appendChild(css);
  }

  function preferences() {
    document.querySelector('.cookie-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'cookie-modal';
    modal.innerHTML = `
      <div class="cookie-box" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
        <h3 id="cookie-title">Preferenze cookie</h3>
        <p>Puoi scegliere quali cookie autorizzare. I cookie tecnici sono necessari al funzionamento di sito, area clienti e sicurezza.</p>
        <div class="cookie-row"><div><strong>Tecnici necessari</strong><small>Login, sicurezza, preferenze essenziali. Sempre attivi.</small></div><input type="checkbox" checked disabled></div>
        <div class="cookie-row"><div><strong>Funzionali</strong><small>Ricordano preferenze e migliorano l'esperienza.</small></div><input id="cookie-functional" type="checkbox" checked></div>
        <div class="cookie-row"><div><strong>Statistiche e marketing</strong><small>Misurano visite e richieste e aiutano a valutare le campagne. Attivi solo con il tuo consenso.</small></div><input id="cookie-marketing" type="checkbox"></div>
        <div class="cookie-actions"><button class="primary" id="cookie-save">Salva preferenze</button><button id="cookie-reject-modal">Rifiuta non necessari</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cookie-save').onclick = () => save({ necessary: true, functional: modal.querySelector('#cookie-functional').checked, marketing: modal.querySelector('#cookie-marketing').checked });
    modal.querySelector('#cookie-reject-modal').onclick = () => save({ necessary: true, functional: false, marketing: false });
  }

  function banner() {
    style();
    const existing = getConsent();
    if (existing?.version) return apply(existing);
    const el = document.createElement('div');
    el.className = 'cookie-banner';
    el.innerHTML = `
      <h3>Cookie e privacy</h3>
      <p>Usiamo cookie tecnici necessari per sicurezza, area clienti e preferenze. Puoi accettare tutti i cookie o personalizzare il consenso.</p>
      <div class="cookie-actions">
        <button class="primary" id="cookie-accept">Accetta tutti</button>
        <button id="cookie-reject">Rifiuta non necessari</button>
        <button id="cookie-prefs">Preferenze</button>
        <a href="/privacy.html">Privacy policy</a>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#cookie-accept').onclick = () => save({ necessary: true, functional: true, marketing: true });
    el.querySelector('#cookie-reject').onclick = () => save({ necessary: true, functional: false, marketing: false });
    el.querySelector('#cookie-prefs').onclick = preferences;
  }

  window.reitanoOpenCookiePreferences = preferences;
  document.addEventListener('DOMContentLoaded', banner);
})();

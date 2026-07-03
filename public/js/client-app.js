(() => {
  const TOKEN_KEY = 'reitanoClientToken';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let client = null;
  let content = {};
  let interventions = [];
  let invoices = [];
  let panels = [];
  let paymentMethods = [];
  let reviews = [];
  let selectedInterventionId = '';
  let installPrompt = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const date = (d) => d ? new Date(d).toLocaleString('it-IT') : 'Da definire';
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isForm = options.body instanceof FormData;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...options, cache: 'no-store', headers, body: options.body && !isForm && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (res.status === 401) logout();
    if (!res.ok) throw new Error(data.error || 'Operazione non riuscita');
    return data;
  }

  function showAuth() { $('#auth-screen').classList.remove('hidden'); $('#app-shell').classList.add('hidden'); }
  function showApp() { $('#auth-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden'); }
  function logout() { localStorage.removeItem(TOKEN_KEY); token = ''; client = null; showAuth(); }

  function statusLabel(status) {
    return ({ requested:'Richiesto', scheduled:'Programmato', in_progress:'In lavorazione', waiting_parts:'Attesa materiali', completed:'Completato', cancelled:'Annullato', draft:'Bozza', sent:'Inviata', paid:'Pagata', overdue:'Scaduta' })[status] || status || 'Richiesto';
  }

  function contactLinks() {
    const c = content.contact || {};
    const phone = String(c.phone || '').replace(/[^+\d]/g, '');
    const wa = String(c.whatsapp || c.phone || '').replace(/\D/g, '');
    const brand = content.brand?.shortName || 'Reitano';
    return {
      phone: phone ? `tel:${phone}` : '#',
      email: c.email ? `mailto:${c.email}` : '#',
      wa: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Ciao ${brand}, sono ${client?.name || 'un cliente'} e vorrei assistenza.`)}` : '#'
    };
  }

  function renderStats() {
    const open = interventions.filter(i => !['completed','cancelled'].includes(i.status)).length;
    const completed = interventions.filter(i => i.status === 'completed').length;
    const due = invoices.filter(i => !['paid','cancelled'].includes(i.status));
    const onlinePanels = panels.filter(p => p.status === 'online').length;
    $('#stats').innerHTML = `
      <div class="stat"><strong>${open}</strong><span>Interventi aperti</span></div>
      <div class="stat"><strong>${completed}</strong><span>Completati</span></div>
      <div class="stat"><strong>${due.length}</strong><span>Fatture aperte</span></div>
      <div class="stat"><strong>${onlinePanels}/${panels.length}</strong><span>Quadri online</span></div>
    `;
  }

  function interventionCard(item, compact = false) {
    const selected = selectedInterventionId === item.id;
    const messages = Array.isArray(item.messages) ? item.messages : [];
    return `
      <article class="item" data-intervention-id="${esc(item.id)}">
        <div class="item-row">
          <div>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.description || item.publicNotes || '')}</p>
          </div>
          <span class="badge status-${esc(item.status)}">${statusLabel(item.status)}</span>
        </div>
        <div class="badges">
          <span class="badge">${esc(item.service || 'Intervento')}</span>
          <span class="badge">${esc(item.priority || 'Normale')}</span>
          <span class="badge">${esc(item.location || 'Luogo da definire')}</span>
          <span class="badge">${item.scheduledAt ? `Programmato: ${date(item.scheduledAt)}` : 'Non programmato'}</span>
        </div>
        ${compact ? '' : `<button class="btn soft small" data-open-intervention="${esc(item.id)}" type="button">${selected ? 'Chiudi' : 'Apri dettagli e messaggi'}</button>`}
        ${selected ? `
          <div class="card" style="box-shadow:none;margin-top:6px">
            <h3>Dettagli intervento</h3>
            <p><strong>Note tecnico:</strong> ${esc(item.publicNotes || 'Nessuna nota pubblica.')}</p>
            <div class="messages" style="margin-top:12px">
              ${messages.map(m => `<div class="message ${m.author === 'admin' ? 'admin' : ''}">${esc(m.text)}<small>${m.author === 'admin' ? 'Reitano' : 'Tu'} · ${date(m.createdAt)}</small></div>`).join('') || '<div class="empty">Nessun messaggio.</div>'}
            </div>
            <form class="form" data-message-form="${esc(item.id)}" style="margin-top:12px">
              <label>Scrivi messaggio<textarea name="text" required placeholder="Aggiungi informazioni, orari, dettagli..."></textarea></label>
              <button class="btn" type="submit">Invia messaggio</button>
            </form>
          </div>` : ''}
      </article>
    `;
  }

  function invoiceCard(inv) {
    const method = paymentMethods.find(m => m.id === inv.paymentMethodId);
    return `
      <article class="item">
        <div class="item-row"><div><h3>Fattura ${esc(inv.number)}</h3><p>Cliente: ${esc(inv.clientName)} · Scadenza: ${esc(inv.dueDate || 'Da definire')}</p></div><span class="badge status-${esc(inv.status)}">${statusLabel(inv.status)}</span></div>
        <div class="badges"><span class="badge">Totale ${fmt(inv.totals?.total)}</span><span class="badge">IVA ${fmt(inv.totals?.vat)}</span><span class="badge">Imponibile ${fmt(inv.totals?.subtotal)}</span><span class="badge ${inv.dueInfo?.level === 'overdue' ? 'status-cancelled' : inv.dueInfo?.level === 'soon' || inv.dueInfo?.level === 'today' ? 'status-scheduled' : ''}">${esc(inv.dueInfo?.label || 'Scadenza non indicata')}</span><span class="badge">${esc(inv.paymentType || 'Pagamento')}</span></div>
        <div class="invoice-lines">${(inv.items || []).map(i => `${i.description} — ${i.qty} x ${fmt(i.unitPrice)} + IVA ${i.vatRate}%`).join('\n')}</div>
        ${method ? `<p><strong>Pagamento:</strong> ${esc(method.name)} — ${esc(method.details)}</p>` : ''}
      </article>
    `;
  }

  function sparkline(panel) {
    const signal = (panel.signals || [])[0];
    if (!signal) return '<div class="empty">Nessun segnale storico.</div>';
    const points = (panel.history || []).slice(-18).map((entry) => num(entry.readings?.[signal.name] ?? entry.readings?.[signal.id] ?? signal.value));
    if (!points.length) points.push(num(signal.value));
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const coords = points.map((value, index) => {
      const x = points.length === 1 ? 280 : index * (280 / (points.length - 1));
      const y = 80 - ((value - min) / range) * 70;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg viewBox="0 0 280 90" class="spark" aria-label="Andamento ${esc(signal.name)}"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><line x1="0" y1="84" x2="280" y2="84" stroke="currentColor" opacity=".12"/></svg>`;
  }

  function panelCard(panel) {
    const signals = panel.signals || [];
    const work = panel.projectTitle || panel.interventionTitle || 'Lavoro non collegato';
    const pending = (panel.commands || []).filter((cmd) => cmd.status === 'pending').length;
    return `
      <article class="item panel-card">
        <div class="item-row">
          <div><h3>${esc(panel.name)} <span class="badge">${esc(panel.code || '')}</span></h3><p>${esc(work)} · ${esc(panel.location || 'Luogo non inserito')}</p></div>
          <span class="badge status-${panel.status === 'alarm' ? 'cancelled' : panel.status === 'online' ? 'completed' : 'scheduled'}">${esc(panel.status || 'offline')} · ${esc(panel.powerState || 'off')}</span>
        </div>
        <div class="badges">
          <span class="badge">Ultimo dato: ${date(panel.lastSeen)}</span>
          <span class="badge">Controllo: ${panel.controlEnabled ? 'abilitato' : 'non abilitato'}</span>
          ${pending ? `<span class="badge warn">${pending} comandi in attesa</span>` : ''}
        </div>
        <div class="panel-layout">
          <div class="signals-grid">
            ${signals.map((signal) => `<div class="signal ${signal.status === 'alarm' ? 'alarm' : ''}"><span>${esc(signal.name)}</span><strong>${esc(signal.value || '-')} ${esc(signal.unit || '')}</strong><small>min ${esc(signal.min || '-')} / max ${esc(signal.max || '-')}</small></div>`).join('') || '<div class="empty">Nessun segnale configurato.</div>'}
          </div>
          <div class="trend-box"><strong>Andamento</strong>${sparkline(panel)}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-panel-command="${esc(panel.id)}:power_on" ${panel.controlEnabled ? '' : 'disabled'} type="button">Accendi</button>
          <button class="btn soft small" data-panel-command="${esc(panel.id)}:power_off" ${panel.controlEnabled ? '' : 'disabled'} type="button">Spegni</button>
          <button class="btn soft small" data-panel-command="${esc(panel.id)}:reset_alarm" ${panel.controlEnabled ? '' : 'disabled'} type="button">Reset allarme</button>
        </div>
      </article>
    `;
  }

  function renderPanels() {
    const groups = new Map();
    panels.forEach((panel) => {
      const key = panel.projectTitle || panel.interventionTitle || 'Lavori non collegati';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(panel);
    });
    $('#panels-list').innerHTML = panels.length ? Array.from(groups.entries()).map(([work, list]) => `
      <section class="card" style="box-shadow:none"><h3>${esc(work)}</h3><div class="list" style="margin-top:12px">${list.map(panelCard).join('')}</div></section>
    `).join('') : '<div class="empty">Nessun quadro associato al tuo account.</div>';
  }

  function renderInterventions() {
    const sorted = [...interventions].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    $('#interventions-list').innerHTML = sorted.map(i => interventionCard(i)).join('') || '<div class="empty">Nessun intervento. Crea una nuova richiesta.</div>';
    $('#next-interventions').innerHTML = sorted.filter(i => !['completed','cancelled'].includes(i.status)).slice(0,3).map(i => interventionCard(i,true)).join('') || '<div class="empty">Nessun intervento aperto.</div>';
  }

  function renderInvoices() {
    const open = invoices.filter(i => !['paid','cancelled'].includes(i.status));
    $('#invoices-list').innerHTML = invoices.map(invoiceCard).join('') || '<div class="empty">Nessuna fattura disponibile.</div>';
    $('#due-invoices').innerHTML = open.slice(0,3).map(invoiceCard).join('') || '<div class="empty">Nessuna fattura aperta.</div>';
    $('#payment-methods').innerHTML = paymentMethods.map(m => `<article class="item"><h3>${esc(m.name)}</h3><p>${esc(m.details)}</p><span class="badge">${esc(m.type)}</span></article>`).join('') || '<div class="empty">Nessun metodo pagamento configurato.</div>';
  }

  function renderReviews() {
    const completed = interventions.filter((item) => item.status === 'completed');
    $('#review-intervention').innerHTML = '<option value="">Seleziona intervento</option>' + completed.map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('');
    $('#client-reviews').innerHTML = reviews.map((review) => `
      <article class="item">
        <div class="item-row"><div><h3>${esc(review.interventionTitle)}</h3><p>${esc(review.text)}</p></div><span class="badge ${review.status === 'approved' ? 'status-completed' : review.status === 'rejected' ? 'status-cancelled' : 'status-requested'}">${review.status === 'approved' ? 'Pubblicata' : review.status === 'rejected' ? 'Rifiutata' : 'In approvazione'}</span></div>
        <div class="badges"><span class="badge">${esc(review.rating)} stelle</span><span class="badge">${date(review.createdAt)}</span></div>
      </article>
    `).join('') || '<div class="empty">Nessuna recensione inviata.</div>';
  }

  function renderContacts() {
    const c = content.contact || {};
    const links = contactLinks();
    $('#quick-whatsapp').href = links.wa;
    $('#contact-list').innerHTML = `
      <a class="item" href="${links.phone}"><h3>Telefono</h3><p>${esc(c.phone || 'Da inserire')}</p></a>
      <a class="item" href="${links.wa}" target="_blank" rel="noopener"><h3>WhatsApp</h3><p>Apri chat con messaggio pronto</p></a>
      <a class="item" href="${links.email}"><h3>Email</h3><p>${esc(c.email || 'Da inserire')}</p></a>
      ${c.instagram ? `<a class="item" href="${esc(c.instagram)}" target="_blank" rel="noopener"><h3>Instagram</h3><p>Apri la pagina Instagram</p></a>` : ''}
      <a class="item" href="${esc(c.googleMapsUrl || '#')}" target="_blank" rel="noopener"><h3>Sede / zona</h3><p>${esc([c.address, c.city].filter(Boolean).join(' - ') || 'Da inserire')}</p></a>
    `;
  }

  function renderServicesSelect() {
    const services = content.services || [];
    $('#service-select').innerHTML = '<option value="">Seleziona</option>' + services.map(s => `<option value="${esc(s.title)}">${esc(s.title)}</option>`).join('');
  }

  function renderProfile() {
    const form = $('#profile-form');
    if (!form || !client) return;
    form.elements.name.value = client.name || '';
    form.elements.company.value = client.company || '';
    form.elements.phone.value = client.phone || '';
    form.elements.vat.value = client.vat || '';
    form.elements.address.value = client.address || '';
    form.elements.password.value = '';
  }

  function renderAll() {
    const logoUrl = content.brand?.logoUrl || '/logo.svg';
    $$('.brand img, .auth-side img').forEach((img) => { img.src = logoUrl; });
    $('#welcome-title').textContent = `Ciao ${client?.name?.split(' ')[0] || ''}`.trim();
    renderStats(); renderInterventions(); renderInvoices(); renderPanels(); renderReviews(); renderProfile(); renderContacts(); renderServicesSelect();
  }

  async function loadAll() {
    const [contentRes, me, intRes, invRes, payRes, panelRes, reviewRes] = await Promise.all([
      fetch('/api/content', { cache: 'no-store' }).then(r => r.json()),
      api('/api/client/me'),
      api('/api/client/interventions'),
      api('/api/client/invoices'),
      api('/api/client/payment-methods'),
      api('/api/client/panels'),
      api('/api/client/reviews')
    ]);
    content = contentRes; client = me.client; interventions = intRes.interventions || []; invoices = invRes.invoices || []; paymentMethods = payRes.paymentMethods || []; panels = panelRes.panels || []; reviews = reviewRes.reviews || [];
    showApp(); renderAll();
  }

  function activate(tab) {
    $$('.nav [data-tab], .card-head [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  }


  function setupRealtime() {
    if (!window.EventSource) return;
    const events = new EventSource('/api/events');
    events.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        if (!data.type || data.type === 'connected') return;
        const relevant = ['content:update','intervention:update','invoice:update','panel:update','panel:command','client:create','lead:create'];
        if (relevant.includes(data.type) && token) await loadAll();
      } catch (error) { console.warn(error); }
    };
  }

  function prefillResetFromUrl() {
    const params = new URLSearchParams(location.search);
    const reset = params.get('reset');
    const email = params.get('email');
    if (!reset && !email) return;
    const resetBtn = $('[data-auth-tab="reset"]');
    resetBtn?.click();
    const form = $('#reset-form');
    if (form) {
      if (email) {
        form.elements.email.value = email;
        form.elements.confirmEmail.value = email;
      }
      if (reset) form.elements.token.value = reset;
    }
  }

  async function setupGoogleLogin() {
    const boxes = ['#google-login-box', '#google-login-box-register'].map((selector) => $(selector)).filter(Boolean);
    if (!boxes.length) return;

    const googleIcon = '<img src="/google.svg" alt="" aria-hidden="true">';
    const fallbackButton = (text = 'Accedi con Google') => `
      <button class="google-login-btn google-login-fallback" type="button">
        ${googleIcon}<span>${text}</span>
      </button>
    `;
    const setFallback = (message) => {
      boxes.forEach((box, index) => {
        box.style.display = 'grid';
        const next = box.nextElementSibling;
        if (next?.classList?.contains('or-line')) next.style.display = 'flex';
        box.innerHTML = fallbackButton(index === 0 ? 'Accedi con Google' : 'Registrati con Google');
        box.querySelector('button')?.addEventListener('click', () => {
          const target = index === 0 ? $('#login-result') : $('#register-result');
          if (target) {
            target.className = 'result error';
            target.textContent = message || 'Google Login non è ancora configurato. Inserisci GOOGLE_CLIENT_ID nel file .env.';
          } else {
            alert(message || 'Google Login non è ancora configurato.');
          }
        });
      });
    };

    try {
      const config = await fetch('/api/public-config', { cache: 'no-store' }).then((res) => res.json());
      if (!config.googleClientId) return setFallback('Google Login non è ancora attivo. Inserisci GOOGLE_CLIENT_ID nel file .env per abilitarlo.');

      boxes.forEach((box, index) => {
        box.style.display = 'grid';
        const next = box.nextElementSibling;
        if (next?.classList?.contains('or-line')) next.style.display = 'flex';
        box.innerHTML = `<div class="google-official" id="google-signin-button-${index}"></div>`;
      });
      window.handleGoogleCredential = async (response) => {
        const out = $('#login-result') || $('#register-result');
        try {
          if (out) { out.className = 'result'; out.textContent = 'Accesso Google...'; }
          const data = await api('/api/client/google-login', { method: 'POST', body: { credential: response.credential } });
          token = data.token;
          localStorage.setItem(TOKEN_KEY, token);
          await loadAll();
        } catch (error) {
          if (out) { out.className = 'result error'; out.textContent = error.message; }
        }
      };

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (!window.google?.accounts?.id) return setFallback('Google non è disponibile in questo momento. Riprova o usa email e password.');
        google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: window.handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true
        });
        boxes.forEach((box, index) => {
          const target = document.getElementById(`google-signin-button-${index}`);
          if (target) google.accounts.id.renderButton(target, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            logo_alignment: 'left',
            width: Math.min(420, box.clientWidth || 340),
            text: index === 0 ? 'continue_with' : 'signup_with'
          });
        });
      };
      script.onerror = () => setFallback('Google non è disponibile in questo momento. Riprova o usa email e password.');
      document.head.appendChild(script);
    } catch (error) {
      setFallback('Google Login non è disponibile in questo momento. Riprova o usa email e password.');
    }
  }

  function setupEvents() {
    $$('.auth-tabs button').forEach(btn => btn.addEventListener('click', () => {
      $$('.auth-tabs button').forEach(b => b.classList.toggle('active', b === btn));
      $$('.auth-form').forEach(f => f.classList.toggle('active', f.id === `${btn.dataset.authTab}-form`));
    }));
    document.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-tab]'); if (tab) activate(tab.dataset.tab);
      if (e.target.closest('[data-go-new]')) activate('new');
      const open = e.target.closest('[data-open-intervention]');
      if (open) { selectedInterventionId = selectedInterventionId === open.dataset.openIntervention ? '' : open.dataset.openIntervention; renderInterventions(); }
      const command = e.target.closest('[data-panel-command]');
      if (command) {
        const [panelId, type] = command.dataset.panelCommand.split(':');
        if (confirm('Inviare comando al quadro?')) {
          try { await api(`/api/client/panels/${panelId}/commands`, { method: 'POST', body: { type } }); await loadAll(); activate('panels'); }
          catch (err) { alert(err.message); }
        }
      }
    });
    $('#refresh-panels')?.addEventListener('click', async () => { await loadAll(); activate('panels'); });
    $('#logout-btn').addEventListener('click', logout);
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#login-result'); out.textContent = 'Accesso...'; out.className = 'result';
      try { const data = await api('/api/client/login', { method:'POST', body:Object.fromEntries(new FormData(e.target)) }); token = data.token; localStorage.setItem(TOKEN_KEY, token); await loadAll(); }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#register-result'); out.textContent = 'Registrazione...'; out.className = 'result';
      try { const data = await api('/api/client/register', { method:'POST', body:Object.fromEntries(new FormData(e.target)) }); token = data.token; localStorage.setItem(TOKEN_KEY, token); await loadAll(); }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#reset-result'); out.textContent = 'Invio istruzioni...'; out.className = 'result';
      try { const data = Object.fromEntries(new FormData(e.target)); await api('/api/client/password-reset/request', { method:'POST', body:{ email:data.email, phone:data.phone } }); out.textContent = 'Se i dati sono corretti riceverai istruzioni via email. Se hai dimenticato anche la mail, la richiesta sarà tracciata in admin.'; out.className = 'result ok'; }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#confirm-reset-btn').addEventListener('click', async () => {
      const form = $('#reset-form'); const data = Object.fromEntries(new FormData(form)); const out = $('#confirm-reset-result'); out.textContent = 'Aggiornamento password...'; out.className = 'result';
      try { await api('/api/client/password-reset/confirm', { method:'POST', body:{ email:data.confirmEmail || data.email, token:data.token, newPassword:data.newPassword } }); out.textContent = 'Password aggiornata. Ora puoi accedere.'; out.className = 'result ok'; }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#profile-result'); out.textContent = 'Salvataggio profilo...'; out.className = 'result';
      try {
        const data = Object.fromEntries(new FormData(e.target));
        if (!data.password) delete data.password;
        await api('/api/client/me', { method: 'PATCH', body: data });
        out.textContent = data.password ? 'Profilo salvato. Email di conferma password inviata se SMTP è configurato.' : 'Profilo salvato.';
        out.className = 'result ok';
        await loadAll(); activate('profile');
      } catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#review-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#review-result'); out.textContent = 'Invio recensione...'; out.className = 'result';
      try { await api('/api/client/reviews', { method:'POST', body:Object.fromEntries(new FormData(e.target)) }); e.target.reset(); out.textContent = 'Recensione inviata. Sarà pubblicata dopo approvazione.'; out.className = 'result ok'; await loadAll(); activate('reviews'); }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    $('#request-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#request-result'); out.textContent = 'Invio richiesta...'; out.className = 'result';
      try { await api('/api/client/interventions', { method:'POST', body:Object.fromEntries(new FormData(e.target)) }); e.target.reset(); out.textContent = 'Richiesta inviata. La trovi nella sezione Interventi.'; out.className = 'result ok'; await loadAll(); activate('interventions'); }
      catch (err) { out.textContent = err.message; out.className = 'result error'; }
    });
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-message-form]'); if (!form) return;
      e.preventDefault();
      try { await api(`/api/client/interventions/${form.dataset.messageForm}/messages`, { method:'POST', body:Object.fromEntries(new FormData(form)) }); await loadAll(); selectedInterventionId = form.dataset.messageForm; renderInterventions(); }
      catch (err) { alert(err.message); }
    });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('#install-btn').classList.add('show'); });
    $('#install-btn').addEventListener('click', async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; $('#install-btn').classList.remove('show'); } });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    setupGoogleLogin();
    setupRealtime();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => null);
    if (!token) { showAuth(); prefillResetFromUrl(); return; }
    try { await loadAll(); } catch { logout(); }
  });
})();

(() => {
  const TOKEN_KEY = 'reitanoAdminToken';
  // Direct /local-admin chiede password; se aperto dal tab Local Admin di /admin usa la sessione già autenticata.
  let token = sessionStorage.getItem('reitanoAdminSessionToken') || '';
  let crm = { clients: [], interventions: [], invoices: [], leads: [], deadlines: [], panels: [], projects: [], paymentMethods: [], stats: {} };
  let content = {};
  let installPrompt = null;
  let pendingAdmin2faToken = "";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const date = (d) => d ? new Date(d).toLocaleString('it-IT') : 'Da definire';
  const statusLabel = (s) => ({ requested:'Richiesto', scheduled:'Programmato', in_progress:'In lavorazione', waiting_parts:'Attesa materiali', completed:'Completato', cancelled:'Annullato', draft:'Bozza', sent:'Inviata', paid:'Pagata', overdue:'Scaduta', active:'Attivo', archived:'Archiviato' })[s] || s || '';

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...options, cache: 'no-store', headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (res.status === 401) logout();
    if (!res.ok) throw new Error(data.error || 'Operazione non riuscita');
    return data;
  }

  function showAuth() { $('#auth-screen').classList.remove('hidden'); $('#app-shell').classList.add('hidden'); }
  function showApp() { $('#auth-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden'); }
  function logout() { token = ''; sessionStorage.removeItem('reitanoAdminSessionToken'); showAuth(); }

  async function loadCrm() {
    const [crmData, contentData] = await Promise.all([
      api('/api/admin/crm'),
      fetch('/api/content', { cache: 'no-store' }).then((res) => res.json())
    ]);
    crm = crmData;
    content = contentData;
    showApp();
    renderAll();
  }

  function activate(tab) {
    $$('.nav [data-tab], .topbar [data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`));
  }

  function renderStats() {
    $('#stats').innerHTML = `
      <div class="stat"><strong>${crm.stats.clients || 0}</strong><span>Clienti registrati</span></div>
      <div class="stat"><strong>${crm.stats.openInterventions || 0}</strong><span>Interventi aperti</span></div>
      <div class="stat"><strong>${crm.stats.websiteRequests || 0}</strong><span>Richieste sito</span></div>
      <div class="stat"><strong>${crm.stats.paymentDeadlines || 0}</strong><span>Scadenze critiche</span></div>
      <div class="stat"><strong>${crm.stats.panelsOnline || 0}/${crm.stats.panels || 0}</strong><span>Quadri online</span></div>
      <div class="stat"><strong>${fmt(crm.stats.unpaidAmount || 0)}</strong><span>Da incassare</span></div>
    `;
  }

  function countBy(list, getter) {
    return (list || []).reduce((acc, item) => {
      const key = typeof getter === 'function' ? getter(item) : item[getter];
      const label = key || 'Non indicato';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
  }

  function barChart(title, data) {
    const entries = Object.entries(data || {});
    const max = Math.max(1, ...entries.map(([, value]) => value));
    return `
      <article class="chart-card">
        <h3>${esc(title)}</h3>
        <div class="bar-chart">
          ${entries.length ? entries.map(([label, value]) => `
            <div class="bar-row">
              <span class="bar-label">${esc(statusLabel(label))}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((value / max) * 100))}%"></span></span>
              <span class="bar-value">${value}</span>
            </div>
          `).join('') : '<div class="empty">Nessun dato.</div>'}
        </div>
      </article>
    `;
  }

  function donutCard(title, done, total, labelDone = 'Completati') {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `
      <article class="chart-card">
        <h3>${esc(title)}</h3>
        <div class="donut-wrap">
          <div class="donut" style="--p1:${pct}%" data-label="${pct}%"></div>
          <div>
            <p><strong>${done}</strong> ${esc(labelDone)}</p>
            <p><strong>${total}</strong> totali</p>
            <p style="color:var(--muted);margin-top:8px">Grafico aggiornato dai dati reali del gestionale.</p>
          </div>
        </div>
      </article>
    `;
  }

  function monthlyRevenue() {
    const map = {};
    (crm.invoices || []).forEach((invoice) => {
      if (invoice.status === 'cancelled') return;
      const source = invoice.paidAt || invoice.dueDate || invoice.createdAt;
      const month = source ? String(source).slice(0, 7) : 'N/D';
      map[month] = (map[month] || 0) + Number(invoice.totals?.total || 0);
    });
    const entries = Object.entries(map).sort().slice(-6);
    const max = Math.max(1, ...entries.map(([, value]) => value));
    return `
      <article class="chart-card">
        <h3>Incassi / fatturato per mese</h3>
        <div class="bar-chart">
          ${entries.length ? entries.map(([month, value]) => `
            <div class="bar-row">
              <span class="bar-label">${esc(month)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((value / max) * 100))}%"></span></span>
              <span class="bar-value">${fmt(value)}</span>
            </div>
          `).join('') : '<div class="empty">Nessuna fattura.</div>'}
        </div>
      </article>
    `;
  }

  function renderCharts() {
    const interventions = crm.interventions || [];
    const invoices = crm.invoices || [];
    const panels = crm.panels || [];
    const completed = interventions.filter((item) => item.status === 'completed').length;
    const paid = invoices.filter((item) => item.status === 'paid').length;
    $('#dashboard-charts').innerHTML = [
      barChart('Stato lavori', countBy(interventions, 'status')),
      barChart('Stato pagamenti', countBy(invoices, 'status')),
      barChart('Quadri / impianti', countBy(panels, 'status')),
      donutCard('Avanzamento lavori', completed, interventions.length, 'completati'),
      donutCard('Fatture pagate', paid, invoices.length, 'pagate'),
      monthlyRevenue()
    ].join('');
  }

  function clientOptions(selected = '') {
    return '<option value="">Seleziona cliente</option>' + crm.clients.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}${c.company ? ` — ${esc(c.company)}` : ''}</option>`).join('');
  }
  function interventionOptions(selected = '') {
    return '<option value="">Nessuno</option>' + crm.interventions.map(i => `<option value="${esc(i.id)}" ${i.id === selected ? 'selected' : ''}>${esc(i.title)} — ${esc(i.clientName)}</option>`).join('');
  }
  function projectOptions(selected = '') {
    return '<option value="">Nessuno</option>' + (crm.projects || []).map(p => `<option value="${esc(p.slug)}" ${p.slug === selected ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
  }
  function paymentOptions(selected = '') {
    return '<option value="">Seleziona metodo</option>' + crm.paymentMethods.map(m => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  }

  function renderSelects() {
    $('#intervention-client').innerHTML = clientOptions();
    $('#invoice-client').innerHTML = clientOptions();
    $('#invoice-intervention').innerHTML = interventionOptions();
    $('#invoice-payment').innerHTML = paymentOptions();
    $('#panel-client').innerHTML = clientOptions();
    $('#panel-intervention').innerHTML = interventionOptions();
    $('#panel-project').innerHTML = projectOptions();
  }

  function leadCard(lead) {
    const converted = lead.status === 'converted';
    return `
      <article class="item" data-lead-id="${esc(lead.id)}">
        <div class="item-row">
          <div><h3>${esc(lead.name || 'Senza nome')}</h3><p>${esc(lead.company || 'Privato')} · ${esc(lead.email || '')} · ${esc(lead.phone || '')}</p></div>
          <span class="badge ${converted ? 'status-completed' : 'status-requested'}">${converted ? 'Convertita' : (lead.type === 'quote' ? 'Preventivo' : 'Contatto')}</span>
        </div>
        <p>${esc(lead.message || '')}</p>
        <div class="badges"><span class="badge">${esc(lead.service || 'Servizio non indicato')}</span><span class="badge">${esc(lead.location || 'Zona non indicata')}</span><span class="badge">${date(lead.createdAt)}</span></div>
        <div class="actions">
          <button class="btn small" data-lead-convert="${esc(lead.id)}" ${converted ? 'disabled' : ''} type="button">Converti in cliente + intervento</button>
          <button class="btn soft small" data-lead-archive="${esc(lead.id)}" ${converted ? 'disabled' : ''} type="button">Archivia</button>
        </div>
      </article>
    `;
  }

  function renderLeads() {
    const leads = crm.leads || [];
    const open = leads.filter((lead) => lead.status !== 'converted' && lead.status !== 'archived');
    $('#leads-list').innerHTML = leads.map(leadCard).join('') || '<div class="empty">Nessuna richiesta dal sito.</div>';
    $('#dashboard-leads').innerHTML = open.slice(0, 4).map(leadCard).join('') || '<div class="empty">Nessuna nuova richiesta.</div>';
  }

  function deadlineCard(inv) {
    const info = inv.dueInfo || {};
    const badgeClass = info.level === 'overdue' ? 'status-cancelled' : info.level === 'today' || info.level === 'soon' ? 'status-scheduled' : 'status-requested';
    const reminders = (inv.reminders || []).slice(-3).reverse().map((r) => `<span class="badge">${esc(r.message)}</span>`).join('');
    return `
      <article class="item" data-deadline-invoice="${esc(inv.id)}">
        <div class="item-row"><div><h3>${esc(inv.number)}</h3><p>${esc(inv.clientName)} · ${esc(inv.paymentType || 'Pagamento')} · ${fmt(inv.totals?.total)}</p></div><span class="badge ${badgeClass}">${esc(info.label || 'Scadenza')}</span></div>
        <div class="badges"><span class="badge">Scadenza ${esc(inv.dueDate || 'N/D')}</span><span class="badge">Stato ${statusLabel(inv.status)}</span>${reminders}</div>
      </article>
    `;
  }

  function renderDeadlines() {
    const deadlines = crm.deadlines || [];
    $('#deadlines-list').innerHTML = deadlines.map(deadlineCard).join('') || '<div class="empty">Nessuna scadenza critica nei prossimi giorni.</div>';
    $('#dashboard-deadlines').innerHTML = deadlines.slice(0, 4).map(deadlineCard).join('') || '<div class="empty">Nessuna scadenza imminente.</div>';
  }

  function sparkline(panel) {
    const signal = (panel.signals || [])[0];
    if (!signal) return '<span class="badge">Nessuno storico</span>';
    const points = (panel.history || []).slice(-12).map((entry) => num(entry.readings?.[signal.name] ?? entry.readings?.[signal.id] ?? signal.value));
    if (!points.length) points.push(num(signal.value));
    const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
    const coords = points.map((value, index) => `${(index * (180 / Math.max(1, points.length - 1))).toFixed(1)},${(50 - ((value - min) / range) * 44).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 180 56" style="width:180px;height:56px;color:var(--ink)"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderPanels() {
    const rows = (crm.panels || []).map((panel) => {
      const alarms = (panel.signals || []).filter((signal) => signal.status === 'alarm').length;
      const pending = (panel.commands || []).filter((cmd) => cmd.status === 'pending').length;
      return `
        <article class="item" data-panel-id="${esc(panel.id)}">
          <div class="item-row">
            <div><h3>${esc(panel.name)} <span class="badge">${esc(panel.code || '')}</span></h3><p>${esc(panel.clientName)} · ${esc(panel.projectTitle || panel.interventionTitle || 'Nessun lavoro collegato')} · ${esc(panel.location || '')}</p></div>
            <span class="badge ${panel.status === 'alarm' ? 'status-cancelled' : panel.status === 'online' ? 'status-completed' : 'status-scheduled'}">${esc(panel.status)} · ${esc(panel.powerState)}</span>
          </div>
          <div class="badges"><span class="badge">Segnali ${(panel.signals || []).length}</span><span class="badge">Allarmi ${alarms}</span><span class="badge">Comandi in attesa ${pending}</span><span class="badge">Ultimo dato ${date(panel.lastSeen)}</span></div>
          <div class="panel-layout"><div class="signals-grid">${(panel.signals || []).map(s => `<div class="signal ${s.status === 'alarm' ? 'alarm' : ''}"><span>${esc(s.name)}</span><strong>${esc(s.value || '-')} ${esc(s.unit || '')}</strong><small>${esc(s.status || 'ok')}</small></div>`).join('') || '<div class="empty">Nessun segnale.</div>'}</div><div class="trend-box"><strong>Storico</strong>${sparkline(panel)}</div></div>
          <div class="actions">
            <button class="btn small" data-panel-admin-command="${esc(panel.id)}:power_on" type="button">Accendi</button>
            <button class="btn soft small" data-panel-admin-command="${esc(panel.id)}:power_off" type="button">Spegni</button>
            <button class="btn soft small" data-panel-admin-command="${esc(panel.id)}:reset_alarm" type="button">Reset allarme</button>
            <button class="btn soft small" data-panel-telemetry="${esc(panel.id)}" type="button">Aggiorna segnali</button>
            <button class="btn soft small" data-panel-edit="${esc(panel.id)}" type="button">Modifica</button>
            <button class="btn danger small" data-panel-delete="${esc(panel.id)}" type="button">Elimina</button>
          </div>
        </article>`;
    }).join('');
    $('#panels-list').innerHTML = rows || '<div class="empty">Nessun quadro configurato.</div>';
  }

  function renderClients() {
    $('#clients-list').innerHTML = crm.clients.map(c => `
      <article class="item" data-client-id="${esc(c.id)}">
        <div class="item-row">
          <div>
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.company || 'Privato')} · ${esc(c.email || 'Email non inserita')}</p>
          </div>
          <select data-client-status="${esc(c.id)}"><option value="active" ${c.status === 'active' ? 'selected' : ''}>Attivo</option><option value="archived" ${c.status === 'archived' ? 'selected' : ''}>Archiviato</option></select>
        </div>
        <table class="mini-table" style="margin-top:12px">
          <tbody>
            <tr><th>Telefono</th><td>${esc(c.phone || '-')}</td></tr>
            <tr><th>Email</th><td>${esc(c.email || '-')}</td></tr>
            <tr><th>Azienda</th><td>${esc(c.company || '-')}</td></tr>
            <tr><th>Indirizzo</th><td>${esc(c.address || '-')}</td></tr>
            <tr><th>P.IVA / CF</th><td>${esc(c.vat || '-')}</td></tr>
            <tr><th>Note</th><td>${esc(c.notes || '-')}</td></tr>
            <tr><th>Registrato</th><td>${date(c.createdAt)}</td></tr>
          </tbody>
        </table>
        <div class="actions"><button class="btn soft small" data-client-edit="${esc(c.id)}" type="button">Modifica telefono</button></div>
      </article>
    `).join('') || '<div class="empty">Nessun cliente.</div>';
  }

  function renderInterventions() {
    const sorted = [...crm.interventions].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const row = (i) => `
      <article class="admin-row" data-intervention-id="${esc(i.id)}">
        <div><strong>${esc(i.title)}</strong><br><span>${esc(i.clientName)} · ${esc(i.service || 'Intervento')}</span></div>
        <select data-intervention-status="${esc(i.id)}">
          ${['requested','scheduled','in_progress','waiting_parts','completed','cancelled'].map(s => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
        <span>${esc(i.priority || 'Normale')}</span>
        <span>${date(i.scheduledAt)}</span>
        <span>${fmt(i.costs?.final || i.costs?.estimate || 0)}</span>
        <button class="btn soft small" data-intervention-open="${esc(i.id)}" type="button">Apri</button>
      </article>
    `;
    $('#interventions-list').innerHTML = sorted.map(row).join('') || '<div class="empty">Nessun intervento.</div>';
    $('#dashboard-interventions').innerHTML = sorted.filter(i=>!['completed','cancelled'].includes(i.status)).slice(0,5).map(i => `
      <article class="item"><div class="item-row"><div><h3>${esc(i.title)}</h3><p>${esc(i.clientName)} · ${date(i.scheduledAt)}</p></div><span class="badge status-${esc(i.status)}">${statusLabel(i.status)}</span></div></article>
    `).join('') || '<div class="empty">Nessun intervento aperto.</div>';
  }

  function renderInvoices() {
    const sorted = [...crm.invoices].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    $('#invoices-list').innerHTML = sorted.map(inv => `
      <article class="item" data-invoice-id="${esc(inv.id)}">
        <div class="item-row">
          <div><h3>Fattura ${esc(inv.number)}</h3><p>${esc(inv.clientName)} · ${esc(inv.paymentType || 'Pagamento')} · scad. ${esc(inv.dueDate || 'N/D')}</p></div>
          <select data-invoice-status="${esc(inv.id)}">
            ${['draft','sent','paid','overdue','cancelled'].map(s => `<option value="${s}" ${inv.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </div>
        <div class="badges">
          <span class="badge">Totale ${fmt(inv.totals?.total)}</span>
          <span class="badge">Imponibile ${fmt(inv.totals?.subtotal)}</span>
          <span class="badge">IVA ${fmt(inv.totals?.vat)}</span>
          <span class="badge ${inv.dueInfo?.level === 'overdue' ? 'status-overdue' : inv.dueInfo?.level === 'soon' || inv.dueInfo?.level === 'today' ? 'status-scheduled' : ''}">${esc(inv.dueInfo?.label || 'Nessuna scadenza')}</span>
        </div>
        <table class="mini-table" style="margin-top:12px">
          <thead><tr><th>Descrizione</th><th>Q.tà</th><th>Prezzo</th><th>IVA</th><th>Totale</th></tr></thead>
          <tbody>${(inv.items || []).map(i => `<tr><td>${esc(i.description)}</td><td>${esc(i.qty)}</td><td>${fmt(i.unitPrice)}</td><td>${esc(i.vatRate)}%</td><td>${fmt(Number(i.qty || 0) * Number(i.unitPrice || 0))}</td></tr>`).join('')}</tbody>
        </table>
        ${(inv.reminders || []).length ? `<div class="badges">${inv.reminders.slice(-4).reverse().map(r => `<span class="badge">${esc(r.message)}${r.sentEmail ? ' · email inviata' : r.emailSkipped ? ' · tracciata' : ''}</span>`).join('')}</div>` : ''}
        ${inv.notes ? `<p>${esc(inv.notes)}</p>` : ''}
        <div class="actions"><button class="btn soft small" data-invoice-print="${esc(inv.id)}" type="button">Stampa</button></div>
      </article>
    `).join('') || '<div class="empty">Nessuna fattura.</div>';
    $('#dashboard-invoices').innerHTML = sorted.filter(i=>!['paid','cancelled'].includes(i.status)).slice(0,5).map(inv => `<article class="item"><div class="item-row"><div><h3>${esc(inv.number)}</h3><p>${esc(inv.clientName)} · ${fmt(inv.totals?.total)} · ${esc(inv.dueInfo?.label || '')}</p></div><span class="badge status-${esc(inv.status)}">${statusLabel(inv.status)}</span></div></article>`).join('') || '<div class="empty">Nessuna fattura aperta.</div>';
  }

  function renderReviews() {
    const reviews = crm.reviews || [];
    $('#reviews-list').innerHTML = reviews.map((review) => `
      <article class="item" data-review-id="${esc(review.id)}">
        <div class="item-row">
          <div><h3>${esc(review.clientName)} · ${esc(review.rating)} stelle</h3><p>${esc(review.interventionTitle)} · ${esc(review.company || '')}</p></div>
          <span class="badge ${review.status === 'approved' ? 'status-completed' : review.status === 'rejected' ? 'status-cancelled' : 'status-requested'}">${review.status === 'approved' ? 'Pubblicata' : review.status === 'rejected' ? 'Rifiutata' : 'Da approvare'}</span>
        </div>
        <p>${esc(review.text)}</p>
        <div class="actions">
          <button class="btn small" data-review-status="${esc(review.id)}:approved" type="button">Approva</button>
          <button class="btn danger small" data-review-status="${esc(review.id)}:rejected" type="button">Rifiuta</button>
          <button class="btn soft small" data-review-status="${esc(review.id)}:pending" type="button">Rimetti in attesa</button>
        </div>
      </article>
    `).join('') || '<div class="empty">Nessuna recensione.</div>';
  }

  function renderPayments() {
    $('#payments-list').innerHTML = crm.paymentMethods.map(m => `
      <article class="item" data-payment-id="${esc(m.id)}">
        <div class="item-row"><div><h3>${esc(m.name)}</h3><p>${esc(m.details)}</p></div><span class="badge">${esc(m.type)}</span></div>
        <div class="actions"><button class="btn soft small" data-payment-toggle="${esc(m.id)}" type="button">${m.enabled === false ? 'Abilita' : 'Disabilita'}</button><button class="btn danger small" data-payment-delete="${esc(m.id)}" type="button">Elimina</button></div>
      </article>
    `).join('') || '<div class="empty">Nessun metodo pagamento.</div>';
  }

  function renderAll() {
    const logoUrl = content.brand?.logoUrl || '/logo.svg';
    $$('.brand img, .auth-side img').forEach((img) => { img.src = logoUrl; });
    renderStats(); renderCharts(); renderSelects(); renderLeads(); renderDeadlines(); renderPanels(); renderClients(); renderInterventions(); renderInvoices(); renderReviews(); renderPayments();
  }

  function printInvoice(id) {
    const inv = crm.invoices.find(i => i.id === id); if (!inv) return;
    const rows = (inv.items || []).map(i => `<tr><td>${esc(i.description)}</td><td>${i.qty}</td><td>${fmt(i.unitPrice)}</td><td>${i.vatRate}%</td><td>${fmt(i.qty*i.unitPrice)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!doctype html><html><head><title>Fattura ${esc(inv.number)}</title><style>body{font-family:Arial;padding:30px;color:#111}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:10px;text-align:left}.total{text-align:right;font-size:22px;font-weight:bold}</style></head><body><h1>Fattura ${esc(inv.number)}</h1><p>Cliente: ${esc(inv.clientName)}<br>Scadenza: ${esc(inv.dueDate || '')}<br>Stato: ${statusLabel(inv.status)}</p><table><thead><tr><th>Descrizione</th><th>Q.tà</th><th>Prezzo</th><th>IVA</th><th>Totale</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Totale: ${fmt(inv.totals?.total)}</p><p>${esc(inv.notes || '')}</p><script>window.print()</script></body></html>`);
    w.document.close();
  }

  async function patch(url, body) { await api(url, { method:'PATCH', body }); await loadCrm(); }


  function setupRealtime() {
    if (!window.EventSource) return;
    const events = new EventSource('/api/events');
    events.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        if (!data.type || data.type === 'connected') return;
        const relevant = ['content:update','intervention:update','invoice:update','panel:update','panel:command','client:create','lead:create'];
        if (relevant.includes(data.type) && token) await loadCrm();
      } catch (error) { console.warn(error); }
    };
  }

  function setupEvents() {
    $('#admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = $('#login-result'); out.textContent = 'Accesso...'; out.className='result';
      try {
        const formData = new FormData(e.target);
        let data;
        if (pendingAdmin2faToken) {
          data = await api('/api/admin/2fa/verify', { method:'POST', body:{ tempToken: pendingAdmin2faToken, code: formData.get('code') }, admin:false });
          pendingAdmin2faToken = '';
        } else {
          data = await api('/api/admin/login', { method:'POST', body:Object.fromEntries(formData), admin:false });
          if (data.requires2fa) {
            pendingAdmin2faToken = data.tempToken;
            $('#login-2fa-wrap')?.classList.remove('hidden');
            out.textContent = 'Inserisci il codice 2FA dell’app Authenticator.'; out.className='result ok';
            return;
          }
        }
        token = data.token; sessionStorage.setItem('reitanoAdminSessionToken', token); await loadCrm();
      }
      catch (err) { out.textContent = err.message; out.className='result error'; }
    });
    $('#logout-btn').addEventListener('click', logout);
    $('#reload-btn').addEventListener('click', loadCrm);
    $('#reload-leads-admin')?.addEventListener('click', async () => { await loadCrm(); activate('requests'); });
    $('#reload-reviews')?.addEventListener('click', async () => { await loadCrm(); activate('reviews'); });
    $('#refresh-panels')?.addEventListener('click', async () => { await loadCrm(); activate('panels'); });
    document.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-tab]'); if (tab) activate(tab.dataset.tab);
      const leadConvert = e.target.closest('[data-lead-convert]');
      if (leadConvert && confirm('Convertire questa richiesta in cliente e intervento?')) {
        const data = await api(`/api/admin/crm/leads/${leadConvert.dataset.leadConvert}/convert`, { method: 'POST', body: {} });
        alert(data.tempPassword ? `Convertita. Password provvisoria cliente: ${data.tempPassword}` : 'Richiesta convertita.');
        await loadCrm(); activate('requests');
      }
      const leadArchive = e.target.closest('[data-lead-archive]');
      if (leadArchive && confirm('Archiviare questa richiesta?')) { await patch(`/api/admin/crm/leads/${leadArchive.dataset.leadArchive}`, { status: 'archived' }); activate('requests'); }
      const reviewStatus = e.target.closest('[data-review-status]');
      if (reviewStatus) { const [reviewId, status] = reviewStatus.dataset.reviewStatus.split(':'); await patch(`/api/admin/crm/reviews/${reviewId}`, { status }); activate('reviews'); }
      const pCmd = e.target.closest('[data-panel-admin-command]');
      if (pCmd) { const [panelId, type] = pCmd.dataset.panelAdminCommand.split(':'); await api(`/api/admin/crm/panels/${panelId}/commands`, { method:'POST', body:{ type } }); await loadCrm(); activate('panels'); }
      const pTelemetry = e.target.closest('[data-panel-telemetry]');
      if (pTelemetry) { const readingsText = prompt('Aggiorna segnali. Formato: Nome|Valore (una riga per segnale)', 'Temperatura quadro|32\nAssorbimento|12'); if (readingsText !== null) { await api(`/api/admin/crm/panels/${pTelemetry.dataset.panelTelemetry}/telemetry`, { method:'POST', body:{ readingsText, status:'online', powerState:'on' } }); await loadCrm(); activate('panels'); } }
      const pEdit = e.target.closest('[data-panel-edit]');
      if (pEdit) { const panel = crm.panels.find(x=>x.id===pEdit.dataset.panelEdit); if (panel) { const name = prompt('Nome quadro', panel.name); if (name !== null) { await patch(`/api/admin/crm/panels/${panel.id}`, { name }); activate('panels'); } } }
      const pDelete = e.target.closest('[data-panel-delete]');
      if (pDelete && confirm('Eliminare questo quadro?')) { await api(`/api/admin/crm/panels/${pDelete.dataset.panelDelete}`, { method:'DELETE' }); await loadCrm(); activate('panels'); }
      const pToggle = e.target.closest('[data-payment-toggle]');
      if (pToggle) { const m = crm.paymentMethods.find(x=>x.id===pToggle.dataset.paymentToggle); if (m) await patch(`/api/admin/crm/payment-methods/${m.id}`, { enabled: m.enabled === false }); }
      const pDel = e.target.closest('[data-payment-delete]');
      if (pDel && confirm('Eliminare metodo pagamento?')) { await api(`/api/admin/crm/payment-methods/${pDel.dataset.paymentDelete}`, { method:'DELETE' }); await loadCrm(); }
      const print = e.target.closest('[data-invoice-print]'); if (print) printInvoice(print.dataset.invoicePrint);
      const open = e.target.closest('[data-intervention-open]'); if (open) {
        const i = crm.interventions.find(x=>x.id===open.dataset.interventionOpen); if (!i) return;
        const msg = prompt(`Messaggio/nota pubblica per ${i.clientName} (lascia vuoto per non inviare)`, '');
        if (msg) await api(`/api/admin/crm/interventions/${i.id}/messages`, { method:'POST', body:{ text: msg } });
        await loadCrm();
      }
      const cEdit = e.target.closest('[data-client-edit]'); if (cEdit) {
        const c = crm.clients.find(x=>x.id===cEdit.dataset.clientEdit); if (!c) return;
        const phone = prompt('Telefono cliente', c.phone || ''); if (phone !== null) await patch(`/api/admin/crm/clients/${c.id}`, { phone });
      }
    });
    document.addEventListener('change', async (e) => {
      const is = e.target.closest('[data-intervention-status]'); if (is) await patch(`/api/admin/crm/interventions/${is.dataset.interventionStatus}`, { status: is.value });
      const cs = e.target.closest('[data-client-status]'); if (cs) await patch(`/api/admin/crm/clients/${cs.dataset.clientStatus}`, { status: cs.value });
      const iv = e.target.closest('[data-invoice-status]'); if (iv) await patch(`/api/admin/crm/invoices/${iv.dataset.invoiceStatus}`, { status: iv.value });
    });
    $('#panel-form').addEventListener('submit', async (e) => { e.preventDefault(); const out=$('#panel-result'); out.textContent='Creazione quadro...'; out.className='result'; try { const body=Object.fromEntries(new FormData(e.target)); await api('/api/admin/crm/panels',{method:'POST',body}); e.target.reset(); out.textContent='Quadro creato.'; out.className='result ok'; await loadCrm(); activate('panels'); } catch(err){ out.textContent=err.message; out.className='result error'; } });
    $('#client-form').addEventListener('submit', async (e) => { e.preventDefault(); const out=$('#client-result'); out.textContent='Salvataggio...'; out.className='result'; try { const data=await api('/api/admin/crm/clients',{method:'POST',body:Object.fromEntries(new FormData(e.target))}); e.target.reset(); out.textContent=`Cliente creato. Password provvisoria: ${data.tempPassword}`; out.className='result ok'; await loadCrm(); } catch(err){ out.textContent=err.message; out.className='result error'; } });
    $('#intervention-form').addEventListener('submit', async (e) => { e.preventDefault(); const out=$('#intervention-result'); out.textContent='Creazione...'; out.className='result'; try { await api('/api/admin/crm/interventions',{method:'POST',body:Object.fromEntries(new FormData(e.target))}); e.target.reset(); out.textContent='Intervento creato.'; out.className='result ok'; await loadCrm(); } catch(err){ out.textContent=err.message; out.className='result error'; } });
    $('#invoice-form').addEventListener('submit', async (e) => { e.preventDefault(); const out=$('#invoice-result'); out.textContent='Creazione fattura...'; out.className='result'; try { await api('/api/admin/crm/invoices',{method:'POST',body:Object.fromEntries(new FormData(e.target))}); e.target.reset(); out.textContent='Fattura creata.'; out.className='result ok'; await loadCrm(); } catch(err){ out.textContent=err.message; out.className='result error'; } });
    $('#payment-form').addEventListener('submit', async (e) => { e.preventDefault(); const out=$('#payment-result'); out.textContent='Salvataggio...'; out.className='result'; try { await api('/api/admin/crm/payment-methods',{method:'POST',body:Object.fromEntries(new FormData(e.target))}); e.target.reset(); out.textContent='Metodo aggiunto.'; out.className='result ok'; await loadCrm(); } catch(err){ out.textContent=err.message; out.className='result error'; } });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('#install-btn').classList.add('show'); });
    $('#install-btn').addEventListener('click', async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; $('#install-btn').classList.remove('show'); } });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    setupRealtime();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => null);
    if (token) {
      try { await loadCrm(); } catch { logout(); }
    } else {
      showAuth();
    }
  });
})();

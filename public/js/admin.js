(() => {
  const TOKEN_KEY = 'reitanoAdminToken';
  // Per sicurezza l'admin non resta loggato tra un'apertura e l'altra.
  // Ogni accesso a /admin richiede sempre la password.
  let token = '';
  let content = {};
  let dirty = false;
  let pendingAdmin2faToken = "";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }

  function slugify(value) {
    return String(value || 'nuovo-lavoro')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nuovo-lavoro';
  }

  function key(part) {
    return /^\d+$/.test(part) ? Number(part) : part;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((acc, part) => (acc == null ? undefined : acc[key(part)]), obj);
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const current = key(parts[i]);
      const next = key(parts[i + 1]);
      if (target[current] == null) target[current] = typeof next === 'number' ? [] : {};
      target = target[current];
    }
    target[key(parts.at(-1))] = value;
  }

  function linesToText(value) {
    return Array.isArray(value) ? value.join('\n') : '';
  }

  function textToLines(value) {
    return String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function ensureArray(name) {
    if (!Array.isArray(content[name])) content[name] = [];
    return content[name];
  }

  function setStatus(message, type = '') {
    const status = $('#status');
    if (!status) return;
    status.className = `status ${type}`.trim();
    status.textContent = message;
  }

  function setSaveDock(show, message = 'Modifiche non salvate') {
    const dock = $('#save-dock');
    const dockMessage = $('#save-dock-message');
    if (!dock) return;
    dock.classList.toggle('show', Boolean(show));
    if (dockMessage) dockMessage.textContent = message;
  }

  function markDirty() {
    dirty = true;
    setStatus('Modifiche non salvate. Premi “Salva e applica al sito”.', 'dirty');
    setSaveDock(true, 'Modifiche non salvate');
  }

  function showLogin() {
    $('#login-screen')?.classList.remove('hidden');
    $('#admin-shell')?.classList.add('hidden');
  }

  function showAdmin() {
    $('#login-screen')?.classList.add('hidden');
    $('#admin-shell')?.classList.remove('hidden');
  }

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');
    const isForm = hasBody && options.body instanceof FormData;

    if (options.admin !== false && token) headers.Authorization = `Bearer ${token}`;
    if (hasBody && !isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers,
      body: hasBody && !isForm && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (response.status === 401 && options.admin !== false) {
      token = '';
      sessionStorage.removeItem('reitanoAdminSessionToken');
      showLogin();
    }
    if (!response.ok) throw new Error(data.error || 'Operazione non riuscita');
    return data;
  }

  function field(label, path, config = {}) {
    let value = getPath(content, path) ?? '';
    if (config.type === 'color' && !String(value).startsWith('#')) value = config.default || '#ffffff';
    const full = config.full ? ' full-field' : '';
    const help = config.help ? `<span class="help">${escapeHtml(config.help)}</span>` : '';
    if (config.textarea) {
      return `
        <label class="${full}">${escapeHtml(label)}
          <textarea data-path="${escapeAttr(path)}" rows="${config.rows || 4}" placeholder="${escapeAttr(config.placeholder || '')}">${escapeHtml(value)}</textarea>
          ${help}
        </label>
      `;
    }
    return `
      <label class="${full}">${escapeHtml(label)}
        <input data-path="${escapeAttr(path)}" type="${escapeAttr(config.type || 'text')}" value="${escapeAttr(value)}" placeholder="${escapeAttr(config.placeholder || '')}">
        ${help}
      </label>
    `;
  }

  function lineField(label, path, config = {}) {
    const value = linesToText(getPath(content, path));
    return `
      <label>${escapeHtml(label)}
        <textarea data-lines="${escapeAttr(path)}" rows="${config.rows || 4}" placeholder="Una voce per riga">${escapeHtml(value)}</textarea>
        <span class="help">Scrivi una voce per riga.</span>
      </label>
    `;
  }

  function group(title, inner, full = false) {
    return `<section class="group-card ${full ? 'full' : ''}"><h3>${escapeHtml(title)}</h3>${inner}</section>`;
  }

  function renderGeneral() {
    const target = $('#general-editor');
    if (!target) return;

    target.innerHTML = [
      group('Brand', `
        <div class="field-grid">
          ${field('Nome completo sito', 'brand.name')}
          ${field('Nome breve', 'brand.shortName')}
        </div>
        <div class="field-grid one" style="margin-top:14px">
          ${field('Tagline', 'brand.tagline')}
          ${field('Logo URL', 'brand.logoUrl', { help: 'Esempio: /logo.svg oppure carica un file SVG/PNG qui sotto.' })}
          <label>Carica nuovo logo SVG/PNG/JPG
            <input class="file-input" type="file" data-upload-logo accept="image/svg+xml,image/png,image/jpeg,image/webp">
            <span class="help">Dopo il caricamento premi “Salva e applica al sito”.</span>
          </label>
          ${field('Descrizione aziendale breve', 'brand.description', { textarea: true, rows: 4 })}
        </div>
      `, true),
      group('Hero / prima sezione', `
        <div class="field-grid">
          ${field('Riga piccola sopra il titolo', 'hero.kicker')}
          ${field('Testo bottone principale', 'hero.primaryCta')}
          ${field('Testo bottone secondario', 'hero.secondaryCta')}
        </div>
        <div class="field-grid one" style="margin-top:14px">
          ${field('Titolo principale', 'hero.title', { textarea: true, rows: 3 })}
          ${field('Sottotitolo', 'hero.subtitle', { textarea: true, rows: 4 })}
        </div>
      `, true),
      group('Contatti', `
        <div class="field-grid">
          ${field('Telefono', 'contact.phone')}
          ${field('WhatsApp', 'contact.whatsapp', { help: 'Inserisci numero con prefisso, es. +39 333...' })}
          ${field('Icona WhatsApp URL', 'contact.whatsappIconUrl', { help: 'Percorso icona personalizzata, es. /uploads/icona.png oppure /whatsapp.svg' })}
          <label>Carica icona WhatsApp
            <input class="file-input" type="file" data-upload-whatsapp-icon accept="image/svg+xml,image/png,image/jpeg,image/webp">
            <span class="help">Dopo il caricamento premi “Salva e applica al sito”.</span>
          </label>
          ${field('Email', 'contact.email', { type: 'email' })}
          ${field('Orari', 'contact.hours')}
          ${field('Indirizzo', 'contact.address')}
          ${field('Città / zona', 'contact.city')}
          ${field('Partita IVA / dati legali', 'contact.vat')}
          ${field('Link Google Maps', 'contact.googleMapsUrl', { type: 'url' })}
          ${field('Facebook URL', 'contact.facebook', { type: 'url' })}
          ${field('Instagram URL', 'contact.instagram', { type: 'url' })}
          ${field('LinkedIn URL', 'contact.linkedin', { type: 'url' })}
        </div>
      `, true),
      group('Titoli sezioni sito', `
        <div class="field-grid">
          ${field('Lavori - kicker', 'sections.worksKicker')}
          ${field('Lavori - titolo', 'sections.worksTitle')}
          ${field('Lavori - testo', 'sections.worksText', { textarea: true, rows: 3 })}
          ${field('Ordine sezioni homepage', 'sections.order', { help: 'ID separati da virgola: servizi,chi-siamo,metodo,lavori,recensioni,contatti' })}
          ${field('Servizi - kicker', 'sections.servicesKicker')}
          ${field('Servizi - titolo', 'sections.servicesTitle')}
          ${field('Servizi - testo', 'sections.servicesText', { textarea: true, rows: 3 })}
          ${field('Chi siamo - kicker', 'sections.aboutKicker')}
          ${field('Chi siamo - titolo', 'sections.aboutTitle')}
          ${field('Chi siamo - testo', 'sections.aboutText', { textarea: true, rows: 3 })}
          ${field('Recensioni - kicker', 'sections.reviewsKicker')}
          ${field('Recensioni - titolo', 'sections.reviewsTitle')}
          ${field('Recensioni - testo', 'sections.reviewsText', { textarea: true, rows: 3 })}
          ${field('Preventivo - kicker', 'sections.quoteKicker')}
          ${field('Preventivo - titolo', 'sections.quoteTitle')}
          ${field('Preventivo - testo', 'sections.quoteText', { textarea: true, rows: 3 })}
          ${field('Metodo - kicker', 'sections.processKicker')}
          ${field('Metodo - titolo', 'sections.processTitle')}
          ${field('Metodo - testo', 'sections.processText', { textarea: true, rows: 3 })}
          ${field('Contatti - kicker', 'sections.contactKicker')}
          ${field('Contatti - titolo', 'sections.contactTitle')}
          ${field('Contatti - testo', 'sections.contactText', { textarea: true, rows: 3 })}
        </div>
      `, true),
      group('Colori, font e dimensioni home page', `
        <div class="field-grid">
          ${field('Sfondo home page', 'theme.homeBgColor', { type: 'color', help: 'Colore principale dello sfondo della home.' })}
          ${field('Sfondo card/sezioni', 'theme.surfaceColor', { type: 'color', help: 'Colore delle card e dei box.' })}
          ${field('Colore bottoni/icone', 'theme.accentColor', { type: 'color', help: 'Colore principale di bottoni, icone e dettagli.' })}
          ${field('Colore titoli', 'theme.headingColor', { type: 'color' })}
          ${field('Colore testi', 'theme.textColor', { type: 'color' })}
          ${field('Immagine sfondo home URL', 'theme.homeBgImage', { help: 'Esempio: /uploads/sfondo.jpg oppure carica qui sotto.' })}
          <label>Carica immagine sfondo home
            <input class="file-input" type="file" data-upload-home-bg accept="image/jpeg,image/png,image/webp,image/gif">
            <span class="help">Dopo il caricamento premi “Salva e applica al sito”.</span>
          </label>
          ${field('Opacità overlay home', 'theme.heroOverlayOpacity', { help: 'Da 0 a 1. Esempio: 0.68' })}
          ${field('Opacità immagine sfondo', 'theme.heroImageOpacity', { help: 'Da 0 a 1. Esempio: 0.18' })}
          ${field('Font sito', 'theme.fontFamily', { help: 'Esempio: Arial, sans-serif oppure Inter, sans-serif' })}
          ${field('Dimensione testo base', 'theme.baseFontSize', { help: 'Esempio: 15px, 16px, 18px' })}
          ${field('Dimensione menu', 'theme.navFontSize', { help: 'Esempio: 15px o 16px' })}
          ${field('Dimensione titolo home', 'theme.heroTitleSize', { help: 'Esempio: 64px oppure clamp(42px, 6vw, 86px)' })}
          ${field('Dimensione titoli sezioni', 'theme.sectionTitleSize', { help: 'Esempio: 42px oppure clamp(30px, 4vw, 54px)' })}
          ${field('Dimensione titoli piccoli', 'theme.heading3Size', { help: 'Esempio: 22px' })}
          ${field('Dimensione titoli card lavori/servizi', 'theme.cardTitleSize', { help: 'Esempio: 20px' })}
        </div>
      `, true),
      group('SEO Google', `
        <div class="field-grid one">
          ${field('Titolo SEO', 'seo.title')}
          ${field('Descrizione SEO', 'seo.description', { textarea: true, rows: 3 })}
        </div>
      `, true)
    ].join('');
  }

  function moveItem(array, index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= array.length) return;
    const [item] = array.splice(index, 1);
    array.splice(nextIndex, 0, item);
  }

  function renderServices() {
    const services = ensureArray('services');
    const target = $('#services-editor');
    if (!target) return;

    if (!services.length) {
      target.innerHTML = '<div class="empty">Nessun servizio. Clicca “Aggiungi servizio”.</div>';
      return;
    }

    target.innerHTML = services.map((service, index) => `
      <article class="repeater-card">
        <header class="repeater-head">
          <h3>Servizio ${index + 1}: ${escapeHtml(service.title || 'senza titolo')}</h3>
          <div class="repeater-actions">
            <button class="small-btn" data-move-service="${index}" data-direction="-1" type="button">↑</button>
            <button class="small-btn" data-move-service="${index}" data-direction="1" type="button">↓</button>
            <button class="small-btn danger" data-remove-service="${index}" type="button">Rimuovi</button>
          </div>
        </header>
        <div class="field-grid">
          ${field('Icona moderna', `services.${index}.icon`, { help: 'Valori consigliati: automation, panel, service, engineering, plc' })}
          ${field('Titolo', `services.${index}.title`)}
          ${field('Descrizione', `services.${index}.description`, { textarea: true, rows: 4 })}
          ${lineField('Punti elenco', `services.${index}.bullets`, { rows: 4 })}
        </div>
      </article>
    `).join('');
  }

  function renderProjects() {
    const projects = ensureArray('projects');
    const target = $('#projects-editor');
    if (!target) return;

    if (!projects.length) {
      target.innerHTML = '<div class="empty">Nessun lavoro. Clicca “Aggiungi lavoro”.</div>';
      return;
    }

    target.innerHTML = projects.map((project, index) => {
      const image = project.image || '/img/project-automazione.svg';
      const slug = project.slug || slugify(project.title || `lavoro-${index + 1}`);
      const gallery = Array.isArray(project.gallery) ? project.gallery : [];
      const galleryHtml = gallery.length ? gallery.map((url, galleryIndex) => `
        <div class="gallery-admin-item">
          <img src="${escapeAttr(url)}" alt="Gallery ${galleryIndex + 1}" onerror="this.src='/img/project-automazione.svg'">
          <button class="small-btn danger" data-remove-gallery="${index}:${galleryIndex}" type="button">Rimuovi</button>
        </div>
      `).join('') : '<div class="empty mini-empty">Nessuna immagine aggiuntiva.</div>';

      return `
        <article class="repeater-card">
          <header class="repeater-head">
            <h3>Lavoro ${index + 1}: ${escapeHtml(project.title || 'senza titolo')}</h3>
            <div class="repeater-actions">
              <a class="small-btn" href="/lavori/${escapeAttr(slug)}" target="_blank" rel="noopener">Apri scheda</a>
              <button class="small-btn" data-move-project="${index}" data-direction="-1" type="button">↑</button>
              <button class="small-btn" data-move-project="${index}" data-direction="1" type="button">↓</button>
              <button class="small-btn danger" data-remove-project="${index}" type="button">Rimuovi</button>
            </div>
          </header>
          <div class="image-tools">
            <div class="preview"><img src="${escapeAttr(image)}" alt="Anteprima immagine" onerror="this.src='/img/project-automazione.svg'"></div>
            <div class="field-grid one">
              ${field('Percorso immagine principale', `projects.${index}.image`, { help: 'Esempio: /uploads/foto.jpg oppure /uploads/lavori/lavoro-1.jpg' })}
              <label>Carica nuova immagine principale
                <input class="file-input" type="file" data-upload-project="${index}" accept="image/jpeg,image/png,image/webp,image/gif">
                <span class="help">Dopo il caricamento, il percorso viene inserito automaticamente.</span>
              </label>
            </div>
          </div>
          <div class="field-grid" style="margin-top:14px">
            ${field('Titolo', `projects.${index}.title`)}
            ${field('Slug URL pagina dettaglio', `projects.${index}.slug`, { help: `Esempio: ${slug}. Cambialo solo se vuoi modificare il link.` })}
            ${field('Categoria', `projects.${index}.category`)}
            ${field('Cliente', `projects.${index}.client`)}
            ${field('Zona / luogo', `projects.${index}.location`)}
            ${field('Anno', `projects.${index}.year`)}
            ${field('Descrizione breve card', `projects.${index}.description`, { textarea: true, rows: 4 })}
            ${field('Descrizione dettagliata pagina lavoro', `projects.${index}.detailedDescription`, { textarea: true, rows: 6 })}
            ${lineField('Punti elenco / attività', `projects.${index}.bullets`, { rows: 4 })}
            ${lineField('Gallery immagini aggiuntive', `projects.${index}.gallery`, { rows: 4 })}
          </div>
          <div class="gallery-admin" style="margin-top:14px">
            <div class="gallery-admin-head">
              <h4>Immagini aggiuntive pagina dettaglio</h4>
              <label class="gallery-upload">Carica più immagini
                <input class="file-input" type="file" data-upload-gallery="${index}" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
              </label>
            </div>
            <div class="gallery-admin-grid">${galleryHtml}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderExtra() {
    const target = $('#extra-editor');
    if (!target) return;
    const stats = ensureArray('stats');
    const process = ensureArray('process');

    const statsHtml = stats.length ? stats.map((stat, index) => `
      <article class="repeater-card">
        <header class="repeater-head">
          <h3>Numero ${index + 1}</h3>
          <div class="repeater-actions">
            <button class="small-btn" data-move-stat="${index}" data-direction="-1" type="button">↑</button>
            <button class="small-btn" data-move-stat="${index}" data-direction="1" type="button">↓</button>
            <button class="small-btn danger" data-remove-stat="${index}" type="button">Rimuovi</button>
          </div>
        </header>
        <div class="field-grid">
          ${field('Valore', `stats.${index}.value`)}
          ${field('Etichetta', `stats.${index}.label`)}
        </div>
      </article>
    `).join('') : '<div class="empty">Nessun numero inserito.</div>';

    const processHtml = process.length ? process.map((step, index) => `
      <article class="repeater-card">
        <header class="repeater-head">
          <h3>Step ${index + 1}</h3>
          <div class="repeater-actions">
            <button class="small-btn" data-move-step="${index}" data-direction="-1" type="button">↑</button>
            <button class="small-btn" data-move-step="${index}" data-direction="1" type="button">↓</button>
            <button class="small-btn danger" data-remove-step="${index}" type="button">Rimuovi</button>
          </div>
        </header>
        <div class="field-grid">
          ${field('Titolo', `process.${index}.title`)}
          ${field('Descrizione', `process.${index}.description`, { textarea: true, rows: 3 })}
        </div>
      </article>
    `).join('') : '<div class="empty">Nessuno step inserito.</div>';

    target.innerHTML = `
      <div class="extra-layout">
        ${group('Testo aziendale / Approccio', `
          <div class="field-grid one">
            ${field('Titolo sezione', 'about.title')}
            ${field('Testo sezione', 'about.text', { textarea: true, rows: 5 })}
          </div>
        `, true)}
        <div class="two-cols">
          <section>
            <div class="panel-head"><h3>Numeri nel blocco hero</h3><p>Compariranno sotto il titolo principale.</p></div>
            <div class="repeaters">${statsHtml}</div>
          </section>
          <section>
            <div class="panel-head"><h3>Step metodo</h3><p>Compariranno nella sezione “Metodo”.</p></div>
            <div class="repeaters">${processHtml}</div>
          </section>
        </div>
      </div>
    `;
  }

  function renderJson() {
    const editor = $('#json-editor');
    if (editor) editor.value = JSON.stringify(content, null, 2);
  }

  function renderAll() {
    renderGeneral();
    renderServices();
    renderProjects();
    renderExtra();
    renderJson();
  }

  async function loadContent() {
    setStatus('Caricamento contenuti...');
    content = await api('/api/content', { admin: false });
    renderAll();
    dirty = false;
    setSaveDock(false);
    setStatus('Contenuti caricati.', 'ok');
  }

  async function saveContent() {
    try {
      $('#save-btn').disabled = true;
      setStatus('Salvataggio in corso...');
      await api('/api/admin/content', { method: 'POST', body: content });
      dirty = false;
      renderJson();
      setSaveDock(false);
      setStatus('Salvato e applicato. Aggiorna il sito per vedere le modifiche.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      $('#save-btn').disabled = false;
    }
  }

  async function uploadWhatsappIcon(file) {
    if (!file) return;
    try {
      setStatus('Caricamento icona WhatsApp...');
      const formData = new FormData();
      formData.append('image', file);
      const data = await api('/api/admin/upload', { method: 'POST', body: formData });
      setPath(content, 'contact.whatsappIconUrl', data.url);
      renderGeneral();
      renderJson();
      markDirty();
      setStatus('Icona WhatsApp caricata. Premi “Salva e applica al sito”.', 'dirty');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function uploadHomeBackground(file) {
    if (!file) return;
    try {
      setStatus('Caricamento sfondo home...');
      const formData = new FormData();
      formData.append('image', file);
      const data = await api('/api/admin/upload', { method: 'POST', body: formData });
      setPath(content, 'theme.homeBgImage', data.url);
      renderGeneral();
      renderJson();
      markDirty();
      setStatus('Sfondo home caricato. Premi “Salva e applica al sito”.', 'dirty');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    try {
      setStatus('Caricamento logo...');
      const formData = new FormData();
      formData.append('image', file);
      const data = await api('/api/admin/upload', { method: 'POST', body: formData });
      setPath(content, 'brand.logoUrl', data.url);
      renderGeneral();
      renderJson();
      markDirty();
      setStatus('Logo caricato. Premi “Salva e applica al sito”.', 'dirty');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function uploadProjectImage(index, file) {
    if (!file) return;
    try {
      setStatus('Caricamento immagine...');
      const formData = new FormData();
      formData.append('image', file);
      const data = await api('/api/admin/upload', { method: 'POST', body: formData });
      ensureArray('projects')[index].image = data.url;
      renderProjects();
      renderJson();
      markDirty();
      setStatus('Immagine caricata. Premi “Salva modifiche”.', 'dirty');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function uploadProjectGallery(index, files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    try {
      setStatus(`Caricamento ${list.length} immagini aggiuntive...`);
      const projects = ensureArray('projects');
      if (!Array.isArray(projects[index].gallery)) projects[index].gallery = [];

      for (const file of list) {
        const formData = new FormData();
        formData.append('image', file);
        const data = await api('/api/admin/upload', { method: 'POST', body: formData });
        projects[index].gallery.push(data.url);
      }

      renderProjects();
      renderJson();
      markDirty();
      setStatus('Immagini aggiuntive caricate. Premi “Salva modifiche”.', 'dirty');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function leadPhoneHref(phone) {
    const clean = String(phone || '').replace(/[^+\d]/g, '');
    return clean ? `tel:${clean}` : '#';
  }

  function leadMailHref(email) {
    return email ? `mailto:${email}` : '#';
  }

  async function loadLeads() {
    const target = $('#leads-list');
    if (!target) return;
    target.innerHTML = '<div class="empty">Caricamento richieste...</div>';
    try {
      const data = await api('/api/admin/leads');
      const leads = data.leads || [];
      if (!leads.length) {
        target.innerHTML = '<div class="empty">Nessuna richiesta ricevuta.</div>';
        return;
      }
      target.innerHTML = leads.map((lead) => {
        const date = lead.createdAt ? new Date(lead.createdAt).toLocaleString('it-IT') : '';
        const detailBadges = [
          ['Azienda', lead.company],
          ['Servizio', lead.service],
          ['Zona', lead.location],
          ['Urgenza', lead.timeframe],
          ['Contatto', lead.preferredContact]
        ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
          `<span class="badge">${escapeHtml(label)}: ${escapeHtml(value)}</span>`
        )).join('');
        return `
          <article class="lead-card">
            <header>
              <h3>${escapeHtml(lead.name || 'Senza nome')}</h3>
              <span class="badge">${escapeHtml(lead.type === 'quote' ? 'Preventivo' : 'Contatto')}</span>
            </header>
            <div class="lead-meta">
              ${date ? `<span class="badge">${escapeHtml(date)}</span>` : ''}
              ${detailBadges}
            </div>
            <p>${escapeHtml(lead.message || '')}</p>
            <div class="lead-links">
              ${lead.phone ? `<a href="${escapeAttr(leadPhoneHref(lead.phone))}">Chiama: ${escapeHtml(lead.phone)}</a>` : ''}
              ${lead.email ? `<a href="${escapeAttr(leadMailHref(lead.email))}">Email: ${escapeHtml(lead.email)}</a>` : ''}
              <button data-delete-lead="${escapeAttr(lead.id)}" type="button">Elimina</button>
            </div>
          </article>
        `;
      }).join('');
    } catch (error) {
      target.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function activateTab(tabName) {
    $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
    $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
    if (tabName === 'json') renderJson();
    if (tabName === 'leads') loadLeads();
  }

  function setupEvents() {
    $('#login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const msg = $('#login-message');
      const formData = new FormData(event.currentTarget);
      if (msg) { msg.className = 'message'; msg.textContent = 'Accesso in corso...'; }
      try {
        let data;
        if (pendingAdmin2faToken) {
          data = await api('/api/admin/2fa/verify', { method: 'POST', body: { tempToken: pendingAdmin2faToken, code: formData.get('code') }, admin: false });
          pendingAdmin2faToken = '';
        } else {
          data = await api('/api/admin/login', { method: 'POST', body: { password: formData.get('password') }, admin: false });
          if (data.requires2fa) {
            pendingAdmin2faToken = data.tempToken;
            $('#login-2fa-wrap')?.classList.remove('hidden');
            if (msg) { msg.className = 'message ok'; msg.textContent = 'Inserisci il codice 2FA dell’app Authenticator.'; }
            return;
          }
        }
        token = data.token;
        sessionStorage.setItem('reitanoAdminSessionToken', token);
        if (msg) { msg.className = 'message ok'; msg.textContent = data.warning || 'Accesso effettuato.'; }
        showAdmin();
        await loadContent();
      } catch (error) {
        if (msg) { msg.className = 'message error'; msg.textContent = error.message; }
      }
    });

    $('#logout-btn')?.addEventListener('click', () => {
      token = '';
      sessionStorage.removeItem('reitanoAdminSessionToken');
      showLogin();
    });

    $('#save-btn')?.addEventListener('click', saveContent);
    $('#save-btn-dock')?.addEventListener('click', saveContent);
    $('#save-json')?.addEventListener('click', () => {
      try {
        content = JSON.parse($('#json-editor').value);
        renderAll();
        saveContent();
      } catch (error) {
        setStatus(`JSON non valido: ${error.message}`, 'error');
      }
    });

    $('#apply-json')?.addEventListener('click', () => {
      try {
        content = JSON.parse($('#json-editor').value);
        renderAll();
        markDirty();
        setStatus('JSON applicato all\'editor. Premi “Salva modifiche”.', 'dirty');
      } catch (error) {
        setStatus(`JSON non valido: ${error.message}`, 'error');
      }
    });

    $('#add-service')?.addEventListener('click', () => {
      ensureArray('services').push({ icon: 'automation', title: 'Nuovo servizio', description: 'Descrizione servizio', bullets: ['Punto 1', 'Punto 2'] });
      renderServices();
      markDirty();
    });

    $('#add-project')?.addEventListener('click', () => {
      const count = ensureArray('projects').length + 1;
      ensureArray('projects').push({
        title: 'Nuovo lavoro',
        slug: `nuovo-lavoro-${count}`,
        category: 'Categoria',
        client: 'Cliente industriale',
        location: 'Da modificare',
        year: 'Da modificare',
        description: 'Descrizione breve lavoro',
        detailedDescription: 'Descrizione dettagliata del lavoro, modificabile dal pannello admin.',
        image: '/img/project-automazione.svg',
        gallery: [],
        bullets: ['Punto 1', 'Punto 2']
      });
      renderProjects();
      markDirty();
    });

    $('#add-stat')?.addEventListener('click', () => {
      ensureArray('stats').push({ value: 'Nuovo', label: 'Descrizione numero' });
      renderExtra();
      markDirty();
    });

    $('#add-step')?.addEventListener('click', () => {
      ensureArray('process').push({ title: 'Nuovo step', description: 'Descrizione step' });
      renderExtra();
      markDirty();
    });

    $('#reload-leads')?.addEventListener('click', loadLeads);

    $('#twofa-status-btn')?.addEventListener('click', async () => {
      const out = $('#twofa-status');
      try {
        const data = await api('/api/admin/security');
        if (out) { out.className = 'status ok'; out.textContent = data.twoFactor.enabled ? `2FA attiva dal ${data.twoFactor.enabledAt || ''}` : '2FA non attiva.'; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#twofa-setup-btn')?.addEventListener('click', async () => {
      const out = $('#twofa-status');
      try {
        const data = await api('/api/admin/2fa/setup', { method: 'POST', body: {} });
        $('#twofa-box')?.classList.remove('hidden');
        $('#twofa-secret').value = data.secret;
        $('#twofa-uri').value = data.otpauth;
        if (out) { out.className = 'status ok'; out.textContent = 'Inserisci questa chiave nella tua app Authenticator e conferma con il codice a 6 cifre.'; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#twofa-enable-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const out = $('#twofa-status');
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api('/api/admin/2fa/enable', { method: 'POST', body: data });
        if (out) { out.className = 'status ok'; out.textContent = '2FA attivata. Dal prossimo accesso servirà anche il codice Authenticator.'; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#twofa-disable-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const out = $('#twofa-status');
      if (!confirm('Disattivare la 2FA riduce la sicurezza. Continuare?')) return;
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api('/api/admin/2fa/disable', { method: 'POST', body: data });
        if (out) { out.className = 'status ok'; out.textContent = '2FA disattivata.'; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#test-email-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const out = $('#test-email-status');
      try {
        if (out) { out.className = 'status'; out.textContent = 'Invio email test...'; }
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api('/api/admin/test-email', { method: 'POST', body: data });
        if (out) { out.className = 'status ok'; out.textContent = 'Email test inviata correttamente.'; }
      } catch (error) {
        if (out) { out.className = 'status error'; out.textContent = error.message; }
      }
    });

    $('#reset-theme-btn')?.addEventListener('click', async () => {
      const out = $('#reset-status');
      if (!confirm('Ripristinare colori e font predefiniti?')) return;
      try {
        if (out) { out.className = 'status'; out.textContent = 'Ripristino tema...'; }
        const data = await api('/api/admin/reset-theme', { method: 'POST', body: {} });
        content.theme = data.theme;
        renderAll();
        if (out) { out.className = 'status ok'; out.textContent = 'Colori e font ripristinati. Aggiorna il sito.'; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#reset-site-btn')?.addEventListener('click', async () => {
      const out = $('#reset-status');
      if (!confirm('ATTENZIONE: ripristinare i contenuti del sito ai valori iniziali? Verrà creato un backup automatico.')) return;
      try {
        if (out) { out.className = 'status'; out.textContent = 'Reset sito in corso...'; }
        const data = await api('/api/admin/reset-site', { method: 'POST', body: {} });
        await loadContent();
        if (out) { out.className = 'status ok'; out.textContent = `Sito ripristinato. Backup creato: ${data.backup}`; }
      } catch (error) { if (out) { out.className = 'status error'; out.textContent = error.message; } }
    });

    $('#export-content-btn')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `content-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#admin-password-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const out = $('#password-status');
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (data.newPassword !== data.confirmPassword) {
        if (out) { out.className = 'status error'; out.textContent = 'Le nuove password non coincidono.'; }
        return;
      }
      try {
        if (out) { out.className = 'status'; out.textContent = 'Salvataggio nuova password...'; }
        await api('/api/admin/password', { method: 'POST', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
        event.currentTarget.reset();
        if (out) { out.className = 'status ok'; out.textContent = 'Password modificata. Al prossimo accesso userai la nuova password.'; }
      } catch (error) {
        if (out) { out.className = 'status error'; out.textContent = error.message; }
      }
    });

    document.addEventListener('click', async (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) activateTab(tab.dataset.tab);

      const removeService = event.target.closest('[data-remove-service]');
      if (removeService) {
        ensureArray('services').splice(Number(removeService.dataset.removeService), 1);
        renderServices();
        markDirty();
      }

      const moveService = event.target.closest('[data-move-service]');
      if (moveService) {
        moveItem(ensureArray('services'), Number(moveService.dataset.moveService), Number(moveService.dataset.direction));
        renderServices();
        markDirty();
      }

      const removeProject = event.target.closest('[data-remove-project]');
      if (removeProject) {
        ensureArray('projects').splice(Number(removeProject.dataset.removeProject), 1);
        renderProjects();
        markDirty();
      }

      const moveProject = event.target.closest('[data-move-project]');
      if (moveProject) {
        moveItem(ensureArray('projects'), Number(moveProject.dataset.moveProject), Number(moveProject.dataset.direction));
        renderProjects();
        markDirty();
      }

      const removeGallery = event.target.closest('[data-remove-gallery]');
      if (removeGallery) {
        const [projectIndex, galleryIndex] = removeGallery.dataset.removeGallery.split(':').map(Number);
        const project = ensureArray('projects')[projectIndex];
        if (project && Array.isArray(project.gallery)) {
          project.gallery.splice(galleryIndex, 1);
          renderProjects();
          renderJson();
          markDirty();
        }
      }

      const removeStat = event.target.closest('[data-remove-stat]');
      if (removeStat) {
        ensureArray('stats').splice(Number(removeStat.dataset.removeStat), 1);
        renderExtra();
        markDirty();
      }

      const moveStat = event.target.closest('[data-move-stat]');
      if (moveStat) {
        moveItem(ensureArray('stats'), Number(moveStat.dataset.moveStat), Number(moveStat.dataset.direction));
        renderExtra();
        markDirty();
      }

      const removeStep = event.target.closest('[data-remove-step]');
      if (removeStep) {
        ensureArray('process').splice(Number(removeStep.dataset.removeStep), 1);
        renderExtra();
        markDirty();
      }

      const moveStep = event.target.closest('[data-move-step]');
      if (moveStep) {
        moveItem(ensureArray('process'), Number(moveStep.dataset.moveStep), Number(moveStep.dataset.direction));
        renderExtra();
        markDirty();
      }

      const deleteLead = event.target.closest('[data-delete-lead]');
      if (deleteLead) {
        const id = deleteLead.dataset.deleteLead;
        if (confirm('Eliminare questa richiesta?')) {
          await api(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
          loadLeads();
        }
      }
    });

    document.addEventListener('input', (event) => {
      const input = event.target;
      if (input.matches('[data-path]')) {
        setPath(content, input.dataset.path, input.value);
        markDirty();
      }
      if (input.matches('[data-lines]')) {
        setPath(content, input.dataset.lines, textToLines(input.value));
        markDirty();
      }
    });

    document.addEventListener('change', (event) => {
      const input = event.target.closest('[data-upload-project]');
      if (input) uploadProjectImage(Number(input.dataset.uploadProject), input.files?.[0]);

      const galleryInput = event.target.closest('[data-upload-gallery]');
      if (galleryInput) uploadProjectGallery(Number(galleryInput.dataset.uploadGallery), galleryInput.files);

      const logoInput = event.target.closest('[data-upload-logo]');
      if (logoInput) uploadLogo(logoInput.files?.[0]);

      const homeBgInput = event.target.closest('[data-upload-home-bg]');
      if (homeBgInput) uploadHomeBackground(homeBgInput.files?.[0]);

      const whatsappIconInput = event.target.closest('[data-upload-whatsapp-icon]');
      if (whatsappIconInput) uploadWhatsappIcon(whatsappIconInput.files?.[0]);
    });

    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    token = '';
    sessionStorage.removeItem('reitanoAdminSessionToken');
    showLogin();
  });
})();

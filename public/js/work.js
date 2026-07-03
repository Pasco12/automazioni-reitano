(() => {
  let siteContent = {};
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
    return String(value || 'lavoro')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'lavoro';
  }

  function text(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value || '';
  }

  function href(selector, value) {
    const el = $(selector);
    if (el && value) el.href = value;
  }

  function whatsappPhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('00')) return raw.slice(2).replace(/\D/g, '');
    return raw.replace(/\D/g, '');
  }

  function buildWhatsAppUrl(message = '') {
    const c = siteContent.contact || {};
    const phone = whatsappPhone(c.whatsapp || c.phone);
    if (!phone) return '/#contatti';
    const brand = siteContent.brand?.shortName || siteContent.brand?.name || 'Reitano Automazioni';
    const text = message || `Ciao ${brand}, vorrei ricevere informazioni sui vostri servizi.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  function applyTheme() {
    const theme = siteContent.theme || {};
    const root = document.documentElement;
    const set = (name, value, fallback) => root.style.setProperty(name, value || fallback);
    set('--home-bg', theme.homeBgColor, '#ffffff');
    set('--surface-bg', theme.surfaceColor, '#ffffff');
    set('--accent-color', theme.accentColor, '#111111');
    set('--heading-color', theme.headingColor, '#111111');
    set('--body-text-color', theme.textColor, '#424242');
    set('--site-font', theme.fontFamily, 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    set('--base-font-size', theme.baseFontSize, '16px');
    set('--nav-font-size', theme.navFontSize, '16px');
    set('--h1-size', theme.heroTitleSize, 'clamp(38px, 5.2vw, 72px)');
    set('--h2-size', theme.sectionTitleSize, 'clamp(30px, 4.2vw, 54px)');
    set('--h3-size', theme.heading3Size, '22px');
    set('--card-title-size', theme.cardTitleSize, '21px');
    root.style.setProperty('--home-bg-image', theme.homeBgImage ? `url('${String(theme.homeBgImage).replace(/'/g, '%27')}')` : 'none');
    set('--hero-overlay-opacity', theme.heroOverlayOpacity, '0.68');
    set('--hero-image-opacity', theme.heroImageOpacity, '0.18');
  }

  function telHref(value) {
    const cleaned = String(value || '').replace(/[^+\d]/g, '');
    return cleaned ? `tel:${cleaned}` : '/#contatti';
  }

  function mailHref(value) {
    return value ? `mailto:${value}` : '/#contatti';
  }

  function renderBase() {
    applyTheme();
    const brand = siteContent.brand || {};
    const contact = siteContent.contact || {};
    const logoUrl = brand.logoUrl || '/logo.svg';
    $$('.brand-logo, .footer-brand img').forEach((img) => { img.src = logoUrl; });
    text('#brand-short', brand.shortName || brand.name);
    text('#brand-tagline', brand.tagline);
    text('#footer-brand', brand.name);
    text('#footer-short', brand.shortName || brand.name);
    text('#footer-vat', contact.vat);
    text('#year', new Date().getFullYear());
    href('#header-call', telHref(contact.phone));
    href('#floating-call', telHref(contact.phone));
    href('#floating-whatsapp', buildWhatsAppUrl());
    const floatingWa = $('#floating-whatsapp');
    if (floatingWa) {
      const icon = contact.whatsappIconUrl || '/whatsapp.svg';
      floatingWa.innerHTML = `<img src="${escapeAttr(icon)}" alt="" aria-hidden="true"><span>WhatsApp</span>`;
    }
  }

  function renderNotFound() {
    const target = $('#work-detail');
    if (!target) return;
    document.title = `Lavoro non trovato | ${siteContent.brand?.name || 'Reitano Automazioni'}`;
    target.innerHTML = `
      <section class="not-found">
        <p class="eyebrow">Scheda non trovata</p>
        <h1>Lavoro non disponibile.</h1>
        <p style="margin-top:14px;color:var(--muted)">La scheda richiesta non esiste o è stata modificata dal pannello admin.</p>
        <div class="hero-actions" style="justify-content:center">
          <a class="btn" href="/#lavori">Torna ai lavori</a>
          <a class="btn btn-soft" href="/#preventivo">Richiedi preventivo</a>
        </div>
      </section>
    `;
  }

  function renderProject(project) {
    const target = $('#work-detail');
    if (!target) return;

    const brandName = siteContent.brand?.name || 'Reitano Automazioni Industriali & Service';
    document.title = `${project.title} | ${brandName}`;
    const metaDescription = project.description || siteContent.seo?.description || '';
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute('content', metaDescription);

    const mainImage = project.image || '/img/project-automazione.svg';
    const gallery = [mainImage, ...(Array.isArray(project.gallery) ? project.gallery : [])].filter(Boolean);
    const bullets = Array.isArray(project.bullets) ? project.bullets : [];
    const message = `Ciao ${siteContent.brand?.shortName || 'Reitano Automazioni'}, vorrei informazioni sul lavoro: ${project.title}.`;

    target.innerHTML = `
      <a class="back-link" href="/#lavori">← Torna a tutti i lavori</a>

      <section class="detail-hero reveal">
        <div class="detail-cover">
          <img src="${escapeAttr(mainImage)}" alt="${escapeAttr(project.title)}" onerror="this.src='/img/project-automazione.svg'">
        </div>
        <article class="detail-card">
          <div>
            <p class="eyebrow">${escapeHtml(project.category || 'Lavoro')}</p>
            <h1>${escapeHtml(project.title)}</h1>
            <p class="detail-description">${escapeHtml(project.description)}</p>
            <div class="detail-meta-grid">
              <div class="detail-meta"><span>Cliente</span><strong>${escapeHtml(project.client || 'Da modificare')}</strong></div>
              <div class="detail-meta"><span>Zona</span><strong>${escapeHtml(project.location || 'Da modificare')}</strong></div>
              <div class="detail-meta"><span>Anno</span><strong>${escapeHtml(project.year || 'Da modificare')}</strong></div>
              <div class="detail-meta"><span>Categoria</span><strong>${escapeHtml(project.category || 'Automazione')}</strong></div>
            </div>
          </div>
          <div class="hero-actions">
            <a class="btn" href="${escapeAttr(buildWhatsAppUrl(message))}" target="_blank" rel="noopener">Chiedi un lavoro simile</a>
            <a class="btn btn-soft" href="/#preventivo">Richiedi preventivo</a>
          </div>
        </article>
      </section>

      <section class="detail-content-grid reveal">
        <article class="detail-section-card">
          <p class="eyebrow">Dettagli</p>
          <h2>Descrizione intervento</h2>
          <p>${escapeHtml(project.detailedDescription || project.description || '')}</p>
        </article>
        <aside class="detail-section-card">
          <p class="eyebrow">Attività</p>
          <h2>Cosa è stato gestito</h2>
          <ul class="clean-list" style="margin-top:16px">
            ${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('') || '<li>Analisi tecnica</li><li>Intervento operativo</li><li>Collaudo finale</li>'}
          </ul>
        </aside>
      </section>

      <section class="reveal" style="margin-top:44px">
        <div class="section-head">
          <div>
            <p class="eyebrow">Gallery</p>
            <h2>Immagini del lavoro</h2>
          </div>
          <p>Dal pannello admin puoi aggiungere altre foto a questa scheda lavoro.</p>
        </div>
        <div class="detail-gallery">
          ${gallery.map((image, index) => `
            <a href="${escapeAttr(image)}" target="_blank" rel="noopener" aria-label="Apri immagine ${index + 1}">
              <img src="${escapeAttr(image)}" alt="${escapeAttr(project.title)} - immagine ${index + 1}" loading="lazy" onerror="this.src='/img/project-automazione.svg'">
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }


  function setupFloatingStopBeforeFooter() {
    const footer = document.querySelector('.site-footer');
    const root = document.documentElement;
    if (!footer) return;
    const update = () => {
      const rect = footer.getBoundingClientRect();
      const overlap = Math.max(0, window.innerHeight - rect.top);
      const bottom = overlap > 0 ? overlap + 18 : 20;
      root.style.setProperty('--floating-safe-bottom', `${bottom}px`);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  function setupMenu() {
    const toggle = $('.menu-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      const opened = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(opened));
    });
    $$('.main-nav a').forEach((link) => {
      link.addEventListener('click', () => {
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  async function init() {
    setupMenu();
    setupFloatingStopBeforeFooter();
    try {
      const response = await fetch('/api/content', { cache: 'no-store', headers: { Accept: 'application/json' } });
      siteContent = await response.json();
      renderBase();
      const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
      const project = (siteContent.projects || []).find((item) => (item.slug || slugify(item.title)) === slug);
      if (!project) return renderNotFound();
      renderProject(project);
    } catch (error) {
      console.error(error);
      renderNotFound();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

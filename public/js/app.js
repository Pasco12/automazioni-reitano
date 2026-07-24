(() => {
  const fallbackContent = {
    brand: {
      name: 'Reitano Automazioni Industriali & Service',
      shortName: 'Reitano Automazioni',
      tagline: 'Automazioni industriali, quadri elettrici e service'
    },
    contact: {
      phone: '+39 351 912 5291',
      whatsapp: '+39 351 912 5291',
      email: 'reitanopasquale12@gmail.com',
      pec: 'reitanopasquale2026@pec.it',
      address: 'Via Garibaldi 200',
      city: 'Gioia Tauro (RC) • Calabria',
      postalCode: '89013',
      vat: 'P.IVA 03365930803 • REA RC-227010',
      vatNumber: '03365930803',
      rea: 'RC-227010',
      hours: 'Lun - Ven / 08:00 - 18:00'
    },
    sections: {},
    services: [],
    projects: [],
    stats: [],
    process: []
  };

  let siteContent = fallbackContent;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function text(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value || '';
  }

  function href(selector, value) {
    const el = $(selector);
    if (el && value) el.href = value;
  }

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

  function iconSvg(name) {
    const key = String(name || '').toLowerCase();
    const icons = {
      plc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
      electric: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>',
      panel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/><path d="M17 16h.01"/></svg>',
      revamp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/></svg>',
      repair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.8 2.8-3-3 2.8-2.8Z"/></svg>',
      automation: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4v4H4zM16 4h4v4h-4zM16 16h4v4h-4z"/><path d="M8 10h4a4 4 0 0 0 4-4M8 10h4a4 4 0 0 1 4 4v2"/></svg>',
      engineering: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 16 17 6l3 3-10 10H7v-3Z"/><path d="M14 9l3 3"/></svg>',
      service: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.8 2.8-3-3 2.8-2.8Z"/></svg>'
    };
    return icons[key] || icons.automation;
  }

  function telHref(value) {
    const cleaned = String(value || '').replace(/[^+\d]/g, '');
    return cleaned ? `tel:${cleaned}` : '#contatti';
  }

  function mailHref(value) {
    return value ? `mailto:${value}` : '#contatti';
  }

  function whatsappPhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('00')) return raw.slice(2).replace(/\D/g, '');
    return raw.replace(/\D/g, '');
  }

  function buildWhatsAppUrl(customMessage = '') {
    const c = siteContent.contact || {};
    const phone = whatsappPhone(c.whatsapp || c.phone);
    if (!phone) return '#contatti';
    const brand = siteContent.brand?.shortName || siteContent.brand?.name || 'Reitano Automazioni';
    const message = customMessage || `Ciao ${brand}, vorrei ricevere informazioni sui vostri servizi.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function trackEvent(name, params = {}) {
    if (!window.reitanoCookieConsent?.marketing || typeof window.gtag !== 'function') return;
    window.gtag('event', name, {
      page_location: window.location.href,
      page_path: window.location.pathname,
      ...params
    });
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
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme.homeBgColor || '#ffffff');
  }

  function formMessage(form) {
    const data = new FormData(form);
    const type = data.get('type') === 'quote' ? 'vorrei richiedere un preventivo.' : 'vorrei ricevere informazioni.';
    const brand = siteContent.brand?.shortName || siteContent.brand?.name || 'Reitano Automazioni';
    const lines = [
      `Ciao ${brand}, ${type}`,
      data.get('name') ? `Nome: ${data.get('name')}` : '',
      data.get('company') ? `Azienda: ${data.get('company')}` : '',
      data.get('phone') ? `Telefono: ${data.get('phone')}` : '',
      data.get('email') ? `Email: ${data.get('email')}` : '',
      data.get('service') ? `Servizio: ${data.get('service')}` : '',
      data.get('location') ? `Zona: ${data.get('location')}` : '',
      data.get('timeframe') ? `Urgenza: ${data.get('timeframe')}` : '',
      data.get('preferredContact') ? `Contatto preferito: ${data.get('preferredContact')}` : '',
      data.get('message') ? `Messaggio: ${data.get('message')}` : ''
    ];
    return lines.filter(Boolean).join('\n');
  }

  function applySectionOrder() {
    if (document.body.dataset.page !== 'home') return;
    const order = String(siteContent.sections?.order || '').split(',').map((item) => item.trim()).filter(Boolean);
    const main = document.querySelector('main');
    if (!main || !order.length) return;
    const sections = new Map(Array.from(main.children).filter((el) => el.id).map((el) => [el.id, el]));
    const anchor = document.querySelector('.hero');
    order.forEach((id) => {
      const section = sections.get(id);
      if (section) main.appendChild(section);
    });
    if (anchor) main.insertBefore(anchor, main.firstElementChild);
  }

  function renderStats() {
    const stats = Array.isArray(siteContent.stats) ? siteContent.stats : [];
    const target = $('#stats-list');
    if (!target) return;
    target.innerHTML = stats.map((item) => `
      <div class="stat-card">
        <strong>${escapeHtml(item.value)}</strong>
        <span>${escapeHtml(item.label)}</span>
      </div>
    `).join('');
  }

  function renderServices() {
    const services = Array.isArray(siteContent.services) ? siteContent.services : [];
    const target = $('#services-list');
    if (!target) return;
    const serviceLinks = {
      0: '/servizi/programmazione-plc',
      1: '/servizi/impianti-elettrici-industriali'
    };

    target.innerHTML = services.map((service, index) => `
      <article class="service-card reveal">
        <div class="service-icon" aria-hidden="true">${iconSvg(service.icon)}</div>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.description)}</p>
        <ul class="clean-list">
          ${(service.bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}
        </ul>
        ${['home', 'services'].includes(document.body.dataset.page) && serviceLinks[index] ? `<a class="service-card-link" href="${serviceLinks[index]}">Approfondisci il servizio</a>` : ''}
      </article>
    `).join('');

    $$('[data-service-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">Seleziona un servizio</option>' + services.map((service) => (
        `<option value="${escapeAttr(service.title)}">${escapeHtml(service.title)}</option>`
      )).join('');
      select.value = current;
    });
  }

  function renderHeroPhotos() {
    const target = $('#hero-photo-stack');
    const heroImage = $('#hero-main-image');
    if (heroImage) {
      heroImage.src = '/img/hero-automazione-neutra.webp';
      heroImage.alt = 'Rappresentazione concettuale di una soluzione di automazione industriale';
    }

    if (!target) return;
    target.innerHTML = [
      ['/img/project-plc.svg', 'Programmazione PLC'],
      ['/img/project-quadro.svg', 'Quadri elettrici'],
      ['/img/project-service.svg', 'Assistenza industriale']
    ].map(([image, label]) => `
      <img src="${image}" alt="Grafica: ${label}" loading="eager">
    `).join('');
  }

  function renderProjects() {
    const services = Array.isArray(siteContent.services) ? siteContent.services : [];
    const target = $('#work-grid') || $('#work-strip');
    if (!target) return;
    const serviceLinks = {
      0: '/servizi/programmazione-plc',
      1: '/servizi/impianti-elettrici-industriali'
    };

    const graphics = [
      '/img/project-plc.svg',
      '/img/project-impianti.svg',
      '/img/project-quadro.svg',
      '/img/project-revamping.svg',
      '/img/project-service.svg',
      '/img/project-automazione.svg'
    ];

    target.innerHTML = services.map((service, index) => {
      const image = graphics[index % graphics.length];
      return `
        <article class="work-card capability-card reveal">
          <figure>
            <div class="work-image">
              <img src="${image}" alt="Grafica: ${escapeAttr(service.title)}" loading="lazy">
            </div>
            <figcaption class="work-body">
              <span class="work-meta">Competenza</span>
              <h3>${escapeHtml(service.title)}</h3>
              <p>${escapeHtml(service.description)}</p>
              <a class="work-open" href="${serviceLinks[index] || '#contatti'}">${serviceLinks[index] ? 'Scopri il servizio' : 'Richiedi informazioni'}</a>
            </figcaption>
          </figure>
        </article>
      `;
    }).join('');
  }

  function renderProcess() {
    const process = Array.isArray(siteContent.process) ? siteContent.process : [];
    const target = $('#process-list');
    if (!target) return;
    target.innerHTML = process.map((step, index) => `
      <article class="step reveal">
        <span class="step-number">${String(index + 1).padStart(2, '0')}</span>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.description)}</p>
      </article>
    `).join('');
  }

  function renderAboutFeatures() {
    const features = Array.isArray(siteContent.about?.features) ? siteContent.about.features : [];
    const target = $('#about-features');
    if (!target) return;
    target.innerHTML = features.map((item) => `
      <article class="feature-card">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </article>
    `).join('');
  }

  function renderTestimonials() {
    const reviews = Array.isArray(siteContent.approvedReviews)
      ? siteContent.approvedReviews.map((review) => ({
        name: review.clientName,
        role: review.company || review.interventionTitle || 'Cliente',
        text: review.text
      }))
      : [];
    const target = $('#reviews-list');
    if (!target) return;
    const section = target.closest('.reviews-section');
    if (!reviews.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    target.innerHTML = reviews.map((review) => `
      <article class="review-card reveal">
        <blockquote>“${escapeHtml(review.text)}”</blockquote>
        <div class="review-person">
          <span class="review-avatar">${escapeHtml(String(review.name || 'R').charAt(0))}</span>
          <div><strong>${escapeHtml(review.name)}</strong><span>${escapeHtml(review.role)}</span></div>
        </div>
      </article>
    `).join('');
  }

  function renderSocials() {
    const contact = siteContent.contact || {};
    const target = $('#social-links');
    if (!target) return;

    const links = [
      { label: 'Facebook', url: contact.facebook, icon: '<span class="facebook-mark" aria-hidden="true">f</span>' },
      { label: 'Instagram', url: contact.instagram, icon: '<img src="/instagram.svg" alt="" aria-hidden="true">' },
      { label: 'LinkedIn', url: contact.linkedin, icon: '' }
    ].filter((item) => Boolean(item.url));

    target.innerHTML = links.map((item) => (
      `<a class="social-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${item.icon}<span>${escapeHtml(item.label)}</span></a>`
    )).join('');
  }

  function renderBase() {
    applyTheme();
    const brand = siteContent.brand || {};
    const contact = siteContent.contact || {};
    const hero = siteContent.hero || {};
    const about = siteContent.about || {};
    const seo = siteContent.seo || {};
    const sections = siteContent.sections || {};

    if (document.body.dataset.page === 'home') {
      document.title = seo.title || brand.name || 'Reitano Automazioni Industriali & Service';
      const meta = $('meta[name="description"]');
      if (meta) meta.setAttribute('content', seo.description || brand.description || 'Automazioni industriali e service.');
    }

    const logoUrl = brand.logoUrl || '/logo.svg';
    $$('.brand-logo, .footer-brand img').forEach((img) => { img.src = logoUrl; });
    text('#brand-short', brand.shortName || brand.name);
    text('#brand-tagline', brand.tagline);
    text('#hero-kicker', hero.kicker);
    text('#hero-title', hero.title);
    text('#hero-subtitle', hero.subtitle);
    text('#hero-primary', hero.primaryCta || 'Richiedi preventivo');
    text('#hero-secondary', hero.secondaryCta || 'Vedi i lavori');

    text('#works-kicker', sections.worksKicker);
    text('#works-title', sections.worksTitle);
    text('#works-text', sections.worksText);
    text('#services-kicker', sections.servicesKicker);
    text('#services-title', sections.servicesTitle);
    text('#services-text', sections.servicesText);
    text('#about-kicker', sections.aboutKicker);
    text('#reviews-kicker', sections.reviewsKicker);
    text('#reviews-title', sections.reviewsTitle);
    text('#reviews-text', sections.reviewsText);
    text('#quote-kicker', sections.quoteKicker);
    text('#quote-title', sections.quoteTitle);
    text('#quote-text', sections.quoteText);
    text('#process-kicker', sections.processKicker);
    text('#process-title', sections.processTitle);
    text('#process-text', sections.processText);
    text('#contact-kicker', sections.contactKicker);
    text('#contact-title', sections.contactTitle);
    text('#contact-text', sections.contactText);

    text('#about-title', sections.aboutTitle || about.title);
    text('#about-text', sections.aboutText || about.text);
    text('#contact-hours', contact.hours);
    text('#footer-brand', brand.name);
    text('#footer-short', brand.shortName || brand.name);
    text('#footer-vat', contact.vat);
    text('#year', new Date().getFullYear());
    href('#header-call', telHref(contact.phone));
    href('#hero-secondary', telHref(contact.phone));
    href('#floating-call', telHref(contact.phone));

    href('#quote-phone', telHref(contact.phone));
    text('#quote-phone', contact.phone);
    href('#quote-email', mailHref(contact.email));
    text('#quote-email', contact.email);

    const phoneStrong = $('#contact-phone strong');
    if (phoneStrong) phoneStrong.textContent = contact.phone || '';
    href('#contact-phone', telHref(contact.phone));

    const emailStrong = $('#contact-email strong');
    if (emailStrong) emailStrong.textContent = contact.email || '';
    href('#contact-email', mailHref(contact.email));

    const address = [contact.address, contact.city].filter(Boolean).join(' - ');
    text('#contact-address', address);
    href('#contact-map', contact.googleMapsUrl || '#contatti');

    const waUrl = buildWhatsAppUrl();
    href('#header-whatsapp', waUrl);
    href('#floating-whatsapp', waUrl);
    const floatingWa = $('#floating-whatsapp');
    if (floatingWa) {
      const icon = contact.whatsappIconUrl || '/whatsapp.svg';
      floatingWa.innerHTML = `<img src="${escapeAttr(icon)}" alt="" aria-hidden="true"><span>WhatsApp</span>`;
    }
  }

  function renderAll() {
    renderBase();
    applySectionOrder();
    renderStats();
    renderServices();
    renderHeroPhotos();
    renderProjects();
    renderProcess();
    renderAboutFeatures();
    renderTestimonials();
    renderSocials();
  }

  async function loadContent() {
    try {
      const response = await fetch('/api/content', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Contenuti non disponibili');
      siteContent = await response.json();
      try {
        const reviewsResponse = await fetch('/api/reviews', { cache: 'no-store' });
        const reviewsPayload = await reviewsResponse.json();
        siteContent.approvedReviews = reviewsPayload.reviews || [];
      } catch (reviewError) {
        siteContent.approvedReviews = [];
      }
    } catch (error) {
      console.warn(error);
      siteContent = fallbackContent;
    }
    renderAll();
  }

  function setupForms() {
    $$('[data-wa-form]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const form = link.closest('form');
        const url = buildWhatsAppUrl(form ? formMessage(form) : '');
        trackEvent('whatsapp_click', { link_location: 'form', service: form?.querySelector('[name="service"]')?.value || '' });
        window.open(url, '_blank', 'noopener');
      });
    });

    $$('[data-lead-form]').forEach((form) => {
      let formStarted = false;
      form.addEventListener('focusin', () => {
        if (formStarted) return;
        formStarted = true;
        trackEvent('form_start', { form_name: form.dataset.leadForm || 'lead' });
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const result = $('.form-result', form);
        const button = $('button[type="submit"]', form);
        if (result) {
          result.className = 'form-result';
          result.textContent = 'Invio in corso...';
        }
        if (button) button.disabled = true;

        try {
          const data = Object.fromEntries(new FormData(form).entries());
          data.privacy = Boolean(form.querySelector('[name="privacy"]')?.checked);
          data.source = 'website';

          const response = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || 'Errore invio richiesta');

          trackEvent('generate_lead', {
            form_name: form.dataset.leadForm || 'lead',
            service: data.service || '',
            lead_type: data.type || 'contact'
          });
          form.reset();
          if (result) {
            result.className = 'form-result ok';
            result.textContent = 'La tua richiesta è stata inoltrata.';
          }
        } catch (error) {
          if (result) {
            result.className = 'form-result error';
            result.textContent = error.message || 'Errore durante l\'invio. Riprova o usa WhatsApp.';
          }
        } finally {
          if (button) button.disabled = false;
        }
      });
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || link.matches('[data-wa-form]')) return;
      const hrefValue = link.getAttribute('href') || '';
      if (hrefValue.startsWith('tel:')) trackEvent('phone_click', { link_location: link.id || link.className || 'page' });
      else if (hrefValue.startsWith('mailto:')) trackEvent('email_click', { link_location: link.id || link.className || 'page' });
      else if (hrefValue.includes('wa.me/')) trackEvent('whatsapp_click', { link_location: link.id || link.className || 'page' });
    });
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

  function setupRealtime() {
    if (!window.EventSource) return;
    const events = new EventSource('/api/events');
    events.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        if (data.type === 'content:update') await loadContent();
      } catch (error) { console.warn(error); }
    };
  }

  function setupScroller() {
    const strip = $('#work-strip');
    const prev = $('#scroll-prev');
    const next = $('#scroll-next');
    if (!strip || !prev || !next) return;
    const move = () => Math.max(300, Math.round(strip.clientWidth * 0.78));
    prev.addEventListener('click', () => strip.scrollBy({ left: -move(), behavior: 'smooth' }));
    next.addEventListener('click', () => strip.scrollBy({ left: move(), behavior: 'smooth' }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => null);
    }
    setupMenu();
    setupForms();
    setupScroller();
    setupFloatingStopBeforeFooter();
    setupRealtime();
    loadContent();
  });
})();

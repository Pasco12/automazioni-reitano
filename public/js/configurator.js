(() => {
  const form = document.querySelector('#configurator-form');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.config-step'));
  const back = document.querySelector('#config-back');
  const next = document.querySelector('#config-next');
  const submit = document.querySelector('#config-submit');
  const progress = document.querySelector('#config-progress');
  const stepLabel = document.querySelector('#config-step-label');
  const stepName = document.querySelector('#config-step-name');
  const summary = document.querySelector('#config-summary');
  const analyze = document.querySelector('#config-analyze');
  const aiResult = document.querySelector('#config-ai-result');
  const aiMode = document.querySelector('#config-ai-mode');
  const result = document.querySelector('#config-result');
  const stepNames = ['Tipo di progetto', 'Contesto', 'Dati elettrici', 'Controllo e funzioni', 'Riepilogo'];
  let currentStep = 1;
  let analysis = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  const value = (name) => form.elements[name]?.value?.trim() || '';

  function projectData() {
    return {
      projectType: value('projectType'), sector: value('sector'), projectStage: value('projectStage'),
      location: value('location'), supply: value('supply'), knownPower: value('knownPower'),
      loads: value('loads'), environment: value('environment'), plc: value('plc'), hmi: value('hmi'),
      connectivity: value('connectivity'), functions: value('functions'), description: value('description'),
      timeframe: value('timeframe')
    };
  }

  function validateStep() {
    const active = steps[currentStep - 1];
    const invalid = Array.from(active.querySelectorAll('input, select, textarea')).find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  function renderSummary() {
    const project = projectData();
    const fields = [
      ['Progetto', project.projectType], ['Settore', project.sector], ['Stato', project.projectStage],
      ['Luogo', project.location], ['Tempi', project.timeframe], ['Alimentazione', project.supply || 'Da verificare'],
      ['Potenza', project.knownPower || 'Da verificare'], ['Utenze', project.loads], ['PLC', project.plc || 'Da valutare'],
      ['HMI', project.hmi || 'Da valutare'], ['Connettività', project.connectivity], ['Descrizione', project.description]
    ];
    summary.innerHTML = fields.filter(([, item]) => item).map(([label, item]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(item)}</dd></div>`).join('');
  }

  function showStep(step) {
    currentStep = Math.max(1, Math.min(steps.length, step));
    steps.forEach((item, index) => item.classList.toggle('is-active', index === currentStep - 1));
    progress.style.width = `${(currentStep / steps.length) * 100}%`;
    stepLabel.textContent = `Passaggio ${currentStep} di ${steps.length}`;
    stepName.textContent = stepNames[currentStep - 1];
    back.hidden = currentStep === 1;
    next.hidden = currentStep === steps.length;
    submit.hidden = currentStep !== steps.length;
    if (currentStep === steps.length) renderSummary();
    document.querySelector('.configurator-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function listBlock(title, items) {
    if (!Array.isArray(items) || !items.length) return '';
    return `<section><strong>${escapeHtml(title)}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
  }

  function renderAnalysis(data, mode, notice = '') {
    analysis = data;
    aiMode.textContent = mode === 'ai' ? 'Analisi IA completata' : 'Analisi guidata completata';
    aiResult.innerHTML = `${notice ? `<p class="config-ai-notice">${escapeHtml(notice)}</p>` : ''}<p>${escapeHtml(data.summary || '')}</p>${listBlock('Informazioni da completare', data.missingInformation)}${listBlock('Domande utili', data.questions)}${listBlock('Indicazioni preliminari', data.recommendations)}${listBlock('Da ricordare', data.warnings)}`;
  }

  next.addEventListener('click', () => { if (validateStep()) showStep(currentStep + 1); });
  back.addEventListener('click', () => showStep(currentStep - 1));

  analyze.addEventListener('click', async () => {
    analyze.disabled = true;
    aiMode.textContent = 'Analisi in corso…';
    aiResult.innerHTML = '<p>Sto controllando completezza e coerenza delle informazioni tecniche.</p>';
    try {
      const response = await fetch('/api/configurator/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectData() }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Analisi non disponibile');
      renderAnalysis(payload.analysis, payload.mode, payload.notice);
    } catch (error) {
      aiMode.textContent = 'Analisi non disponibile';
      aiResult.innerHTML = `<p>${escapeHtml(error.message || 'Puoi comunque inviare la configurazione per la verifica tecnica.')}</p>`;
    } finally {
      analyze.disabled = false;
    }
  });

  function configurationMessage() {
    const project = projectData();
    const rows = Object.entries({
      'Tipo progetto': project.projectType, Settore: project.sector, Stato: project.projectStage,
      Luogo: project.location, Tempi: project.timeframe, Alimentazione: project.supply || 'Da verificare',
      Potenza: project.knownPower || 'Da verificare', Utenze: project.loads, Ambiente: project.environment,
      PLC: project.plc || 'Da valutare', HMI: project.hmi || 'Da valutare', Connettività: project.connectivity,
      Funzioni: project.functions, Descrizione: project.description
    }).filter(([, item]) => item).map(([label, item]) => `${label}: ${item}`);
    if (analysis) {
      rows.push('', 'ANALISI PRELIMINARE', `Sintesi: ${analysis.summary || ''}`);
      if (analysis.missingInformation?.length) rows.push(`Dati mancanti: ${analysis.missingInformation.join('; ')}`);
      if (analysis.questions?.length) rows.push(`Domande: ${analysis.questions.join('; ')}`);
      if (analysis.recommendations?.length) rows.push(`Indicazioni: ${analysis.recommendations.join('; ')}`);
    }
    rows.push('', 'Nota: configurazione preliminare soggetta a verifica tecnica.');
    return rows.join('\n');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep()) return;
    result.className = 'form-result';
    result.textContent = 'Invio della configurazione in corso…';
    submit.disabled = true;
    try {
      const payload = {
        type: 'configurator', source: 'guided_configurator', website: value('website'),
        name: value('name'), company: value('company'), phone: value('phone'), email: value('email'),
        requestType: value('projectType'), sector: value('sector'), service: value('projectType'),
        location: value('location'), timeframe: value('timeframe'), message: configurationMessage(),
        privacy: Boolean(form.elements.privacy?.checked)
      };
      const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Invio non riuscito');
      result.className = 'form-result ok';
      result.innerHTML = `Configurazione inviata. La esamineremo prima di ricontattarti.${data.whatsappUrl ? ` <a href="${escapeHtml(data.whatsappUrl)}" target="_blank" rel="noopener">Apri anche WhatsApp</a>.` : ''}`;
      submit.hidden = true;
      window.dataLayer?.push({ event: 'generate_lead', form_name: 'guided_configurator', service: value('projectType'), lead_type: 'configurator' });
    } catch (error) {
      result.className = 'form-result error';
      result.textContent = error.message || 'Errore durante l’invio. Puoi usare i contatti tradizionali.';
    } finally {
      submit.disabled = false;
    }
  });

  showStep(1);
})();

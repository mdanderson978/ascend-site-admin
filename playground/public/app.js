const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const DEVICES = {
  phone: { width: 390, label: 'Phone · 390px' },
  tablet: { width: 820, label: 'Tablet · 820px' },
  laptop: { width: 1280, label: 'Laptop · 1280px' },
  fit: { width: null, label: 'Fit to window' },
};

const store = {
  get(key, fallback) {
    try { return localStorage.getItem(`playground.${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`playground.${key}`, value); } catch {}
  },
};

const state = {
  setup: null,
  sample: null,
  mode: store.get('mode', 'build'),
  theme: store.get('theme', null),
  device: store.get('device', 'laptop'),
  tab: 'page',
  result: null,
  renderSeq: 0,
};

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kb = n => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status${kind ? ` is-${kind}` : ''}`;
}

// ---- rendering ----

let timer;
function scheduleRender(delay = 250) {
  clearTimeout(timer);
  setStatus('Rendering…', 'busy');
  timer = setTimeout(render, delay);
}

async function render() {
  const seq = ++state.renderSeq;
  const body = { yaml: $('#yaml').value, mode: state.mode, theme: state.theme, sampleId: state.sample.id };
  let result;
  try {
    result = await fetch('/api/render', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
  } catch (err) {
    return setStatus(`Couldn't reach the playground server. Is it still running? (${err.message})`, 'error');
  }
  if (seq !== state.renderSeq) return; // a newer render is on its way
  if (!result.ok) return setStatus(`Not rendered: ${result.error}`, 'error');
  state.result = result;
  const n = result.problems.length;
  setStatus(`Rendered in ${result.ms} ms · ${kb(result.bytes.html)} HTML + ${kb(result.bytes.css)} CSS inlined · 0 KB JavaScript${n ? ` · ${n} problem${n === 1 ? '' : 's'}` : ''}`);
  updateFrame(result.doc);
  updateTabs();
}

function updateFrame(doc) {
  const frame = $('#frame');
  let scroll = 0;
  try { scroll = frame.contentWindow.scrollY; } catch {}
  frame.addEventListener('load', () => {
    try { frame.contentWindow.scrollTo(0, scroll); } catch {}
    updateOutline();
  }, { once: true });
  frame.srcdoc = doc;
}

function sizeFrame() {
  const device = DEVICES[state.device];
  const stage = $('#stage');
  const box = $('#frame-box');
  const frame = $('#frame');
  $('#device-label').textContent = device.label;
  if (!device.width) {
    box.classList.add('is-fit');
    Object.assign(box.style, { width: '', height: '' });
    Object.assign(frame.style, { width: '100%', height: '100%', transform: '' });
    return;
  }
  box.classList.remove('is-fit');
  const availW = stage.clientWidth - 48;
  const availH = stage.clientHeight - 48;
  const scale = Math.min(1, availW / device.width);
  const height = Math.max(400, availH);
  Object.assign(frame.style, { width: `${device.width}px`, height: `${height / scale}px`, transform: scale < 1 ? `scale(${scale})` : '' });
  Object.assign(box.style, { width: `${device.width * scale}px`, height: `${height}px` });
  $('#device-label').textContent = scale < 1 ? `${device.label} · shown at ${Math.round(scale * 100)}%` : device.label;
}

// ---- tabs ----

function formatHtml(html) {
  const lines = html.replace(/>\s*</g, '>\n<').split('\n');
  let depth = 0;
  return lines
    .map(line => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = '  '.repeat(depth) + line;
      const opens = /^<([a-z][a-z0-9-]*)\b[^>]*>/i.exec(line);
      if (opens && !/^(img|source|br|hr|meta|link|input)$/i.test(opens[1]) && !line.includes(`</${opens[1]}>`)) depth++;
      return out;
    })
    .join('\n');
}

function highlightHtml(code) {
  return escapeHtml(code)
    .replace(/(&lt;\/?)([a-z][a-z0-9-]*)/gi, '$1<span class="t">$2</span>')
    .replace(/ ([a-z][a-z0-9:_-]*)=&quot;(.*?)&quot;/gi, ' <span class="a">$1</span>=&quot;<span class="v">$2</span>&quot;');
}

function updateTabs() {
  const r = state.result;
  $('#html-out').innerHTML = highlightHtml(formatHtml(r.html));
  $('#html-meta').innerHTML = `What visitors' browsers receive, as published (website mode). ${kb(r.bytes.html)} of HTML; stylesheets used: <strong>${r.stylesheets.join(', ') || 'none'}</strong> (${kb(r.bytes.css)} including tokens, inlined in the page).`;

  $('#saved-out').textContent = r.saved;
  $('#saved-meta').innerHTML = `Only values an editor chose are stored, sorted, with defaults and empty values dropped. ${
    r.stable ? '<span class="badge ok">✓ Saving again changes nothing</span>' : '<span class="badge bad">Saving again would change the file</span>'
  }`;

  const count = $('#problem-count');
  count.textContent = r.problems.length;
  count.classList.toggle('has-problems', r.problems.length > 0);
  $('#problems-out').innerHTML = r.problems.length
    ? r.problems.map((p, i) => `<li><button type="button" data-problem="${i}"><span class="where">${escapeHtml(p.type)}${p.field ? ` · ${escapeHtml(p.field)}` : ''}</span><span>${escapeHtml(p.message)}</span></button></li>`).join('')
    : '<li class="empty-state">No problems. This page is ready to publish.</li>';

  $('#sd-out').textContent = r.structuredData.length ? JSON.stringify(r.structuredData, null, 2) : 'None on this page (FAQ blocks add FAQPage data).';
}

function updateOutline() {
  let doc;
  try { doc = $('#frame').contentDocument; } catch { return; }
  if (!doc) return;
  let previous = 0;
  const items = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(el => {
    const level = Number(el.tagName[1]);
    const prev = previous;
    previous = level;
    const skipped = prev && level > prev + 1;
    const hidden = el.classList.contains('pg-title--hidden') ? ' <span class="where">(page title, visually hidden)</span>' : '';
    return `<li style="margin-left:${(level - 1) * 18}px"><span class="lvl">H${level}</span><span>${escapeHtml(el.textContent.trim())}${hidden}</span>${skipped ? `<span class="warn">skips a level (H${prev} to H${level})</span>` : ''}</li>`;
  });
  $('#outline-out').innerHTML = items.join('') || '<li class="empty-state">No headings.</li>';
}

function renderImages() {
  const { media, encoding } = state.setup;
  $('#images-meta').innerHTML = `Each image is encoded once (at upload, in the finished engine): AVIF at ${encoding.ladder.join(', ')}px wide, quality ${encoding.avifQuality}, plus one WebP fallback at quality ${encoding.webpQuality} for browsers without AVIF. ${
    encoding.photos ? 'Using your photos.' : 'These are generated sample images; run with <code>--photos "folder"</code> to measure real photos.'
  }`;
  const rows = media
    .map(m => {
      const total = m.avif.reduce((s, a) => s + a.bytes, 0);
      const widths = m.avif.map(a => `${a.width}w ${kb(a.bytes)}`).join('<br>');
      return `<tr><td><strong>${escapeHtml(m.name)}</strong><div class="sub">${escapeHtml(m.source)}</div></td><td>${m.width} × ${m.height}</td><td class="num">${widths}</td><td class="num">${kb(total)}</td><td class="num">${kb(m.webpBytes)}</td><td class="num">${m.sourceBytes ? kb(m.sourceBytes) : '-'}</td><td class="num">${kb(total + m.webpBytes)}</td></tr>`;
    })
    .join('');
  $('#images-out').innerHTML = `<thead><tr><th>Image</th><th>Size</th><th class="num">AVIF set</th><th class="num">AVIF total</th><th class="num">WebP fallback</th><th class="num">Original</th><th class="num">Stored in repo</th></tr></thead><tbody>${rows}</tbody>`;
}

// ---- selection: preview <-> YAML ----

function selectInYaml(id) {
  const ta = $('#yaml');
  const lines = ta.value.split('\n');
  const index = lines.findIndex(line => new RegExp(`\\bid: ['"]?${id}['"]?\\s*$`).test(line));
  if (index === -1) return false;
  const start = lines.slice(0, index).join('\n').length + (index ? 1 : 0);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, start + lines[index].length);
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, index * lineHeight - ta.clientHeight / 3);
  return true;
}

window.addEventListener('message', event => {
  if (event.data?.type !== 'select') return;
  const found = selectInYaml(event.data.id);
  setStatus(found ? `Selected ${event.data.element} (${event.data.id}): its YAML is highlighted on the left.` : `Selected ${event.data.element}.`);
});

$('#problems-out').addEventListener('click', event => {
  const button = event.target.closest('[data-problem]');
  if (!button) return;
  const problem = state.result.problems[Number(button.dataset.problem)];
  selectInYaml(problem.id);
  if (state.mode === 'preview') {
    setTab('page');
    $('#frame').contentWindow.postMessage({ type: 'highlight', id: problem.id }, '*');
  }
});

// ---- controls ----

function setPressed(selector, attr, value) {
  $$(selector).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
}

function setTab(tab) {
  state.tab = tab;
  $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.panel').forEach(p => (p.hidden = p.dataset.panel !== tab));
  $('.devices').style.visibility = tab === 'page' ? 'visible' : 'hidden';
  if (tab === 'page') sizeFrame();
}

function loadSample(id) {
  state.sample = state.setup.samples.find(s => s.id === id) || state.setup.samples[0];
  store.set('sample', state.sample.id);
  $('#sample').value = state.sample.id;
  $('#sample-title').textContent = state.sample.title;
  $('#sample-desc').textContent = state.sample.description;
  $('#yaml').value = state.sample.yaml;
  $('#yaml').scrollTop = 0;
  scheduleRender(0);
}

$('#sample').addEventListener('change', e => loadSample(e.target.value));
$('#theme').addEventListener('change', e => {
  state.theme = e.target.value;
  store.set('theme', state.theme);
  scheduleRender(0);
});
$('#reset').addEventListener('click', () => loadSample(state.sample.id));
$('#yaml').addEventListener('input', () => scheduleRender());
$('#yaml').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const ta = e.target;
  ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
  scheduleRender();
});
$$('[data-mode]').forEach(b =>
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    store.set('mode', state.mode);
    setPressed('[data-mode]', 'mode', state.mode);
    scheduleRender(0);
  }),
);
$$('[data-device]').forEach(b =>
  b.addEventListener('click', () => {
    state.device = b.dataset.device;
    store.set('device', state.device);
    setPressed('[data-device]', 'device', state.device);
    sizeFrame();
  }),
);
$$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
window.addEventListener('resize', () => state.tab === 'page' && sizeFrame());

// ---- start ----

(async function init() {
  try {
    state.setup = await fetch('/api/setup').then(r => r.json());
  } catch (err) {
    return setStatus(`Couldn't load the playground: ${err.message}`, 'error');
  }
  $('#sample').innerHTML = state.setup.samples.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('');
  $('#theme').innerHTML = state.setup.themes.map(t => `<option value="${t.id}" title="${escapeHtml(t.description)}">${escapeHtml(t.label)}</option>`).join('');
  if (!state.setup.themes.some(t => t.id === state.theme)) state.theme = state.setup.themes[0].id;
  $('#theme').value = state.theme;
  if (!DEVICES[state.device]) state.device = 'laptop';
  setPressed('[data-mode]', 'mode', state.mode);
  setPressed('[data-device]', 'device', state.device);
  renderImages();
  setTab('page');
  loadSample(store.get('sample', state.setup.samples[0].id));
})();

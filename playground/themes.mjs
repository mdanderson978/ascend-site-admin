// Site themes for the playground: what a source repo's global CSS would
// provide. Elements read these through their --ab-* tokens. No web fonts are
// loaded (sites self-host theirs); system font stacks stand in.

const CLAMP_CSS_BRAND = `
  --brand: #1e5631; --brand-ink: #ffffff; --accent: #c2410c;
  --bg: #fdf8f0; --surface: #ffffff; --ink: #1a2e1e; --muted: #5a7060;
  --radius: 12px;
  --font-display: Georgia, 'Times New Roman', serif;
  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;`;

export const THEMES = [
  {
    id: 'clamp-css',
    label: 'clamp-css starter site',
    description: 'The palette and fonts from the clamp-css skill: what most fleet sites look like out of the box.',
    css: `:root {${CLAMP_CSS_BRAND} }`,
  },
  {
    id: 'navy',
    label: 'Navy and orange brand',
    description: 'A different brand, to check elements adapt with no element CSS changes.',
    css: `:root {
      --brand: #1f3a5f; --brand-ink: #ffffff; --accent: #c2410c;
      --bg: #ffffff; --surface: #eef2f7; --ink: #14213d; --muted: #4a5568;
      --radius: 4px;
      --font-display: 'Trebuchet MS', 'Segoe UI', sans-serif;
      --font-body: 'Segoe UI', system-ui, sans-serif; }`,
  },
  {
    id: 'overrides',
    label: 'Site CSS overriding elements',
    description: 'The clamp-css brand plus a few site-level rules. Site CSS sits outside the element layer, so it always wins without !important.',
    css: `:root {${CLAMP_CSS_BRAND} }
      .ab-btn { border-radius: 999px; letter-spacing: 0.02em; }
      .ab-heading__kicker { color: var(--accent); }
      .ab-faq__item { border-color: var(--brand); }`,
  },
  {
    id: 'defaults',
    label: 'Library defaults (no site CSS)',
    description: 'Only the fallback values built into the element tokens.',
    css: '',
  },
];

// A stand-in for the source repo's page template: header, page title (the
// page's one H1), main content area and footer.
export const TEMPLATE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: var(--bg, #fff); color: var(--ink, #1c1c1c);
    font-family: var(--font-body, system-ui, sans-serif); font-size: var(--ab-step-0);
    -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; }
  .pg-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.9rem var(--ab-gutter); background: var(--surface, #fff);
    border-bottom: 1px solid color-mix(in srgb, var(--ink, #000) 10%, transparent); }
  .pg-logo { font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.15rem; }
  .pg-nav { display: flex; gap: 1.2rem; font-size: 0.95rem; color: var(--muted, #555); }
  .pg-title { max-width: var(--ab-max); margin: 0 auto; padding: var(--ab-space-xl) var(--ab-gutter) 0;
    font-family: var(--font-display, inherit); font-size: var(--ab-step-4); line-height: 1.1; }
  .pg-title--hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .pg-footer { margin-top: var(--ab-space-2xl); padding: var(--ab-space-l) var(--ab-gutter); text-align: center;
    color: var(--muted, #555); font-size: var(--ab-step--1);
    border-top: 1px solid color-mix(in srgb, var(--ink, #000) 10%, transparent); }
  @media (max-width: 640px) { .pg-nav { display: none; } }`;

// Editor-preview affordances: hover and selection outlines, links disabled.
export const PREVIEW_CSS = `
  [data-node] { cursor: pointer; }
  [data-node]:hover { outline: 2px dashed #3b82f6; outline-offset: 2px; }
  [data-node].pg-selected { outline: 2px solid #2563eb; outline-offset: 2px; }`;

export const PREVIEW_SCRIPT = `
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a');
    if (link) event.preventDefault();
    var node = event.target.closest('[data-node]');
    if (!node) return;
    event.preventDefault();
    document.querySelectorAll('.pg-selected').forEach(function (el) { el.classList.remove('pg-selected'); });
    node.classList.add('pg-selected');
    parent.postMessage({ type: 'select', id: node.getAttribute('data-node'), element: node.getAttribute('data-element') }, '*');
  }, true);
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'highlight') return;
    document.querySelectorAll('.pg-selected').forEach(function (el) { el.classList.remove('pg-selected'); });
    var el = document.querySelector('[data-node="' + event.data.id + '"]');
    if (el) { el.classList.add('pg-selected'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });`;

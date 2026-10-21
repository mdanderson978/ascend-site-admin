// Brand: defined once by the developer in the source repo, never edited by a
// client. Browser-safe (no Node built-ins).
//
//   const brand = defineBrand({
//     colors: { primary: '#1e5631', accent: '#c2410c', dark: '#1a2e1e', light: '#fdf8f0' },
//     roles: { brand: 'primary', ink: 'dark', bg: 'light' },   // optional, see ROLES
//     fonts: { display: 'Fraunces, Georgia, serif', body: 'Inter, system-ui, sans-serif' },
//     radius: '12px',
//   });
//
// Each named colour gets 7 shades in OKLCH (100 lightest to 700 darkest).
// brandCss() writes them, plus the role variables the element tokens read
// (--brand, --ink, --bg, ...), as low-priority defaults: a site's own
// unlayered CSS still wins. brandJson() is published as /_ascend/brand.json
// so the admin offers editors exactly these named colours, and only where
// they pass WCAG AA contrast.

export const BRAND_SCHEMA = 1;
export const MAX_BRAND_COLORS = 5;
export const SHADE_STEPS = Object.freeze([100, 200, 300, 400, 500, 600, 700]);

// Target OKLCH lightness and share of the base colour's chroma per shade.
// Very light and very dark shades carry less chroma, as in hand-made palettes.
const SHADE_L = [0.97, 0.92, 0.84, 0.7, 0.56, 0.43, 0.3];
const SHADE_C = [0.12, 0.28, 0.55, 0.9, 1, 0.9, 0.72];

// The role variables the element tokens read (tokens.css), and how each one
// is chosen when `roles` doesn't name it.
export const ROLES = Object.freeze(['brand', 'brandInk', 'accent', 'ink', 'bg', 'surface', 'muted']);
const ROLE_VARS = { brand: '--brand', brandInk: '--brand-ink', accent: '--accent', ink: '--ink', bg: '--bg', surface: '--surface', muted: '--muted' };

// The section tones: background, text and link/button colours, matching the
// .ab-tone-* rules in the section stylesheet.
const TONES = [
  { name: 'default', label: 'Page background', bg: 'bg', ink: 'ink', muted: 'muted', link: 'brand', btnBg: 'brand', btnInk: 'brandInk' },
  { name: 'muted', label: 'Soft background', bg: 'surface', ink: 'ink', muted: 'muted', link: 'brand', btnBg: 'brand', btnInk: 'brandInk' },
  { name: 'brand', label: 'Brand colour', bg: 'brand', ink: 'brandInk', link: 'brandInk', btnBg: 'brandInk', btnInk: 'brand' },
  { name: 'dark', label: 'Dark', bg: 'ink', ink: 'bg', link: 'bg', btnBg: 'bg', btnInk: 'ink' },
];

const AA_TEXT = 4.5;
const AA_LARGE = 3;

// ---------------------------------------------------------------- colour math

function parseHex(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

const toHex = rgb => '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

// Linear sRGB (may be out of gamut) for an OKLCH colour.
function oklchToLinear([L, C, H]) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = lin => lin.every(c => c >= -1e-4 && c <= 1 + 1e-4);

// Keeps lightness and hue, reducing chroma until the colour fits sRGB.
function oklchToHex([L, C, H]) {
  let lo = 0;
  let hi = C;
  if (!inGamut(oklchToLinear([L, C, H]))) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear([L, mid, H]))) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return toHex(oklchToLinear([L, C, H]).map(fromLinear));
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two hex colours, rounded to 2 places. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The 7 shades of a hex colour: [{ step, value }], lightest first. */
export function shadesOf(hex) {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`site-admin brand: "${hex}" is not a hex colour`);
  const [, C, H] = rgbToOklch(rgb);
  return SHADE_STEPS.map((step, i) => ({ step, value: oklchToHex([SHADE_L[i], C * SHADE_C[i], H]) }));
}

// ---------------------------------------------------------------- definition

const titleCase = name => name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * Validates and expands a brand definition. Throws on anything a developer
 * must fix (bad colour, unknown role reference); contrast failures are
 * reported in `problems` instead, so a build still completes.
 */
export function defineBrand(input = {}) {
  const entries = Object.entries(input.colors || {});
  if (!entries.length) throw new Error('site-admin brand: define at least one colour in `colors`');
  if (entries.length > MAX_BRAND_COLORS) {
    throw new Error(`site-admin brand: at most ${MAX_BRAND_COLORS} colours (got ${entries.length}); use shades for variations`);
  }
  const colors = entries.map(([name, spec]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`site-admin brand: colour name "${name}" must be lower-case letters, digits and hyphens`);
    const value = typeof spec === 'string' ? spec : spec?.value;
    const rgb = parseHex(value);
    if (!rgb) throw new Error(`site-admin brand: colour "${name}" needs a hex value like "#1e5631"`);
    return { name, label: (typeof spec === 'object' && spec.label) || titleCase(name), value: toHex(rgb), shades: shadesOf(value) };
  });
  const byName = new Map(colors.map(c => [c.name, c]));

  // A role reference: a colour name ("primary"), a shade ("primary-600") or a hex value.
  const resolve = (ref, role) => {
    const text = String(ref).trim();
    if (parseHex(text)) return { ref: text, value: toHex(parseHex(text)) };
    const m = /^([a-z][a-z0-9-]*?)(?:-(\d{3}))?$/.exec(text);
    const color = m && byName.get(m[1]);
    const shade = color && m[2] ? color.shades.find(s => String(s.step) === m[2]) : null;
    if (!color || (m[2] && !shade)) throw new Error(`site-admin brand: role "${role}" refers to "${text}", which is not a colour or shade in \`colors\``);
    return { ref: text, value: shade ? shade.value : color.value };
  };

  const darkest = [...colors].sort((a, b) => luminance(a.value) - luminance(b.value))[0];
  const given = input.roles || {};
  for (const key of Object.keys(given)) {
    if (!ROLES.includes(key)) throw new Error(`site-admin brand: unknown role "${key}" (roles are ${ROLES.join(', ')})`);
  }
  const roles = {};
  const pick = (role, fallback) => {
    roles[role] = given[role] != null ? resolve(given[role], role) : fallback();
  };
  pick('brand', () => resolve(byName.has('primary') ? 'primary' : colors[0].name, 'brand'));
  pick('accent', () => resolve(byName.has('accent') ? 'accent' : (colors[1] || colors[0]).name, 'accent'));
  pick('ink', () => resolve(byName.has('dark') ? 'dark' : luminance(darkest.value) < 0.05 ? darkest.name : '#1c1c1c', 'ink'));
  pick('bg', () => resolve(byName.has('light') ? 'light' : '#ffffff', 'bg'));
  pick('surface', () => resolve(`${byName.has('primary') ? 'primary' : colors[0].name}-100`, 'surface'));
  pick('brandInk', () => {
    const white = contrastRatio(roles.brand.value, '#ffffff');
    const ink = contrastRatio(roles.brand.value, roles.ink.value);
    return white >= ink ? { ref: '#ffffff', value: '#ffffff' } : { ...roles.ink };
  });
  pick('muted', () => {
    // The ink colour's shades, darkest last: the lightest one that still reads on bg.
    const family = parseHex(roles.ink.ref) ? shadesOf(roles.ink.value) : byName.get(roles.ink.ref.replace(/-\d{3}$/, '')).shades;
    const ok = family.find(s => contrastRatio(s.value, roles.bg.value) >= AA_TEXT && contrastRatio(s.value, roles.surface.value) >= AA_TEXT);
    return ok ? { ref: ok.value, value: ok.value } : { ...roles.ink };
  });

  const fonts = {};
  for (const key of ['display', 'body']) {
    const value = input.fonts?.[key];
    if (value == null) continue;
    if (typeof value !== 'string' || /[;{}<>]/.test(value)) throw new Error(`site-admin brand: fonts.${key} must be a CSS font-family list`);
    fonts[key] = value.trim();
  }
  const radius = input.radius == null ? null : String(input.radius).trim();
  if (radius != null && !/^\d+(\.\d+)?(px|rem|em)$|^0$/.test(radius)) throw new Error('site-admin brand: radius must be a length like "12px" or "0.5rem"');

  return { schema: BRAND_SCHEMA, colors, roles, fonts, radius };
}

// ---------------------------------------------------------------- outputs

/**
 * The brand as CSS custom properties, inside @layer ascend-brand so the
 * site's own CSS always wins. Tokens: --ab-color-<name> and
 * --ab-color-<name>-<100..700>, plus the role variables.
 */
export function brandCss(brand) {
  const lines = [];
  for (const color of brand.colors) {
    lines.push(`--ab-color-${color.name}: ${color.value};`);
    for (const shade of color.shades) lines.push(`--ab-color-${color.name}-${shade.step}: ${shade.value};`);
  }
  for (const role of ROLES) lines.push(`${ROLE_VARS[role]}: ${brand.roles[role].value};`);
  if (brand.radius) lines.push(`--radius: ${brand.radius};`);
  if (brand.fonts.display) lines.push(`--font-display: ${brand.fonts.display};`);
  if (brand.fonts.body) lines.push(`--font-body: ${brand.fonts.body};`);
  return `@layer ascend-brand {\n  :root {\n${lines.map(l => `    ${l}`).join('\n')}\n  }\n}\n`;
}

/**
 * The published /_ascend/brand.json: named colours with shades, resolved
 * roles, and per tone which colours an editor may use there (AA for body
 * text, and for large text and icons), plus any contrast problems in the
 * brand itself.
 */
export function brandJson(brand) {
  const role = name => brand.roles[name].value;
  const swatches = brand.colors.flatMap(c => [
    { id: c.name, label: c.label, value: c.value },
    ...c.shades.map(s => ({ id: `${c.name}-${s.step}`, label: `${c.label} ${s.step}`, value: s.value })),
  ]);
  const problems = [];
  const tones = TONES.map(tone => {
    const bg = role(tone.bg);
    const pairs = [
      ['text', tone.ink, AA_TEXT],
      ['secondary text', tone.muted, AA_TEXT],
      ['links', tone.link, AA_TEXT],
    ];
    for (const [what, r, min] of pairs) {
      if (!r) continue;
      const ratio = contrastRatio(role(r), bg);
      if (ratio < min) problems.push(`"${tone.label}" sections: ${what} contrast is ${ratio}:1, below the ${min}:1 minimum.`);
    }
    const btn = contrastRatio(role(tone.btnInk), role(tone.btnBg));
    if (btn < AA_TEXT) problems.push(`"${tone.label}" sections: button text contrast is ${btn}:1, below the ${AA_TEXT}:1 minimum.`);
    return {
      name: tone.name,
      label: tone.label,
      bg,
      ink: role(tone.ink),
      text: swatches.filter(s => contrastRatio(s.value, bg) >= AA_TEXT).map(s => s.id),
      large: swatches.filter(s => contrastRatio(s.value, bg) >= AA_LARGE).map(s => s.id),
    };
  });
  return {
    schema: BRAND_SCHEMA,
    colors: brand.colors.map(({ name, label, value, shades }) => ({ name, label, value, shades })),
    roles: Object.fromEntries(ROLES.map(r => [r, brand.roles[r].value])),
    fonts: brand.fonts,
    radius: brand.radius,
    tones,
    problems,
  };
}

/** Checks a fetched or configured brand.json has the shape the admin relies on. */
export function isBrandJson(data) {
  return !!data && typeof data === 'object' && data.schema === BRAND_SCHEMA && Array.isArray(data.colors) && Array.isArray(data.tones) && !!data.roles;
}

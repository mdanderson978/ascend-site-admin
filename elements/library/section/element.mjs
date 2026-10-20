import { defineElement, general } from '../../core/registry.mjs';
import { richTextToPlain } from '../../core/sanitize.mjs';

// Host width (px) that each content width is capped at, for image `sizes`.
const HOST_WIDTH = { narrow: 'narrowMax', default: 'containerMax', wide: 'wideMax', full: null };

// More than a short intro's worth of visible text in the section's own text blocks.
function hasLongText(children = []) {
  let paragraphs = 0;
  let chars = 0;
  for (const child of children) {
    if (child.type !== 'prose' || child.props?.hidden) continue;
    const html = String(child.props?.html ?? '');
    paragraphs += (html.match(/<(p|li)\b/g) || []).length;
    chars += richTextToPlain(html).length;
  }
  return paragraphs > 3 || chars > 450;
}

export default defineElement({
  name: 'section',
  title: 'Section',
  group: 'Layout',
  icon: 'section',
  container: true,
  allowedParents: ['layout'],
  ai: 'A full-width band of the page with its own background, holding headings, text, images, buttons and other blocks. Use one section per topic. Attributes: tone (default | muted | brand | dark), spacing (s | m | l | xl), width (narrow | default | wide | full).',
  defaults: { tone: 'default', spacing: 'l', width: 'default', overlay: 'medium', align: 'start' },
  fields: {
    background: {
      type: 'image',
      label: 'Background photo',
      hint: 'Optional. A photo behind the whole section. It is darkened so text on top stays readable, and treated as decoration (screen readers skip it).',
    },
    tone: {
      type: 'token',
      scale: 'tone',
      label: 'Background colour',
      hint: 'The colour behind this section. Text, links and buttons adjust automatically so they stay readable.',
    },
    spacing: {
      type: 'token',
      scale: 'space',
      label: 'Space above and below',
      hint: 'How much breathing room the section has at the top and bottom. It scales smoothly with screen size.',
    },
    width: {
      type: 'token',
      scale: 'width',
      label: 'Content width',
      hint: 'How wide the content inside the section can grow on large screens.',
    },
    align: {
      type: 'align',
      label: 'Align content',
      hint: 'Centre suits short, punchy sections like a hero or a call to action. Headings, text and buttons follow it; FAQs and callouts stay left-aligned so they stay easy to read.',
    },
    overlay: {
      type: 'select',
      label: 'Darken the photo',
      hint: 'More darkening keeps text readable over busy photos.',
      options: [
        { value: 'light', label: 'A little' },
        { value: 'medium', label: 'Medium' },
        { value: 'strong', label: 'A lot' },
      ],
      enable: 'background',
    },
    ...general,
  },
  tabs: {
    Content: ['background'],
    Style: ['tone', 'align', 'spacing', 'width', 'overlay'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  keepEmpty: props => !!props.background,
  childContext(props, ctx, host) {
    const key = HOST_WIDTH[props.width] === undefined ? 'containerMax' : HOST_WIDTH[props.width];
    return { width: { max: key ? host[key] : null, fraction: 1 } };
  },
  async render({ node, props, children, h, cls, root, picture, firstHeadingId, problem }) {
    // The background is a real <img> (never CSS background-image) so the
    // browser can discover it early and give it LCP priority.
    const media = props.background
      ? await picture('background', { decorative: true, sizes: '100vw', className: 'ab-section__bg' })
      : null;
    const centred = props.align === 'center';
    if (centred && hasLongText(node.children)) {
      problem('This section is centred but has a lot of text. Centred text is hard to read beyond a few lines: consider left-aligning it.', 'align');
    }
    const classes = cls(
      'ab-section',
      `ab-section--pad-${props.spacing}`,
      media ? ['ab-tone-media', `ab-section--overlay-${props.overlay}`] : `ab-tone-${props.tone}`,
    );
    const inner = cls('ab-section__inner', `ab-section__inner--${props.width}`, { 'ab-section__inner--center': centred });
    return h`<section${root({ class: classes, 'aria-labelledby': firstHeadingId })}>${media}<div class="${inner}">${children}</div></section>`;
  },
});

import { defineElement, general } from '../../core/registry.mjs';

// Host width (px) that each content width is capped at, for image `sizes`.
const HOST_WIDTH = { narrow: 'narrowMax', default: 'containerMax', wide: 'wideMax', full: null };

export default defineElement({
  name: 'section',
  title: 'Section',
  group: 'Layout',
  icon: 'section',
  container: true,
  allowedParents: ['layout'],
  ai: 'A full-width band of the page with its own background, holding headings, text, images, buttons and other blocks. Use one section per topic. Attributes: tone (default | muted | brand | dark), spacing (s | m | l | xl), width (narrow | default | wide | full).',
  defaults: { tone: 'default', spacing: 'l', width: 'default', overlay: 'medium' },
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
    Style: ['tone', 'spacing', 'width', 'overlay'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  keepEmpty: props => !!props.background,
  childContext(props, ctx, host) {
    const key = HOST_WIDTH[props.width] === undefined ? 'containerMax' : HOST_WIDTH[props.width];
    return { width: { max: key ? host[key] : null, fraction: 1 } };
  },
  async render({ props, children, h, cls, root, picture, firstHeadingId }) {
    // The background is a real <img> (never CSS background-image) so the
    // browser can discover it early and give it LCP priority.
    const media = props.background
      ? await picture('background', { decorative: true, sizes: '100vw', className: 'ab-section__bg' })
      : null;
    const classes = cls(
      'ab-section',
      `ab-section--pad-${props.spacing}`,
      media ? ['ab-tone-media', `ab-section--overlay-${props.overlay}`] : `ab-tone-${props.tone}`,
    );
    return h`<section${root({ class: classes, 'aria-labelledby': firstHeadingId })}>${media}<div class="${cls('ab-section__inner', `ab-section__inner--${props.width}`)}">${children}</div></section>`;
  },
});

import { HEADING_LEVELS, defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'heading',
  title: 'Heading',
  group: 'Text',
  icon: 'heading',
  allowedParents: ['section', 'article'],
  ai: 'A heading for a section or topic, with an optional short line above it (kicker). Attributes: kicker (a few words), level (h2 for main sections, h3 inside them), size (s | m | l | xl | display).',
  defaults: { level: 'h2', size: 'l', align: 'auto' },
  placeholder: { props: { text: 'A clear, helpful heading' } },
  fields: {
    kicker: {
      type: 'string',
      label: 'Small line above',
      hint: 'Optional. A few words that introduce the heading, e.g. "Our services".',
      inline: true,
    },
    text: { type: 'string', label: 'Heading', required: true, inline: true },
    link: { type: 'link', label: 'Link (optional)' },
    size: {
      type: 'token',
      scale: 'type',
      label: 'Size',
      hint: 'How big the heading looks. This is separate from its level, so a heading can look large and still be correctly structured for Google and screen readers.',
    },
    align: {
      type: 'align',
      inherit: true,
      label: 'Alignment',
      hint: 'Usually "Same as section". Choose Left or Centre only when this heading should differ from the rest of its section.',
    },
    level: {
      type: 'heading-level',
      label: 'Heading level',
      hint: 'H2 for main sections, H3 for topics inside them. The page title is already the page\'s only H1.',
    },
    ...general,
  },
  tabs: {
    Content: ['kicker', 'text', 'link'],
    Style: ['size', 'align'],
    Advanced: ['level', 'anchor', 'hidden', 'label'],
  },
  render({ props, h, raw, cls, root, headingId, link }) {
    const text = String(props.text ?? '').trim();
    if (!text) return null;
    const tag = raw(HEADING_LEVELS.includes(props.level) ? props.level : 'h2');
    const id = headingId(text);
    const href = link(props.link);
    const inner = href ? h`<a href="${href}">${text}</a>` : text;
    // 'auto' adds no class: the heading follows its section's alignment.
    const classes = cls('ab-heading', `ab-heading--${props.size}`, {
      'ab-heading--center': props.align === 'center',
      'ab-heading--start': props.align === 'start',
    });

    if (!props.kicker) {
      return h`<${tag}${root({ class: classes, id })}>${inner}</${tag}>`;
    }
    // With a kicker the anchor id goes on the heading itself, not the wrapper.
    return h`<div${root({ class: classes }, { anchor: false })}><p class="ab-heading__kicker">${props.kicker}</p><${tag} id="${id}" class="ab-heading__text">${inner}</${tag}></div>`;
  },
});

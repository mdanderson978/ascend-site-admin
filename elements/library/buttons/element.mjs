import { defineElement, general } from '../../core/registry.mjs';

export const buttons = defineElement({
  name: 'buttons',
  title: 'Buttons',
  group: 'Text',
  icon: 'buttons',
  container: true,
  allowedParents: ['section', 'article'],
  ai: 'A row of one or more buttons (calls to action). Each button has a label and a link; the first is usually style "primary".',
  defaults: { align: 'start' },
  placeholder: {
    children: [
      { type: 'button', props: { text: 'Get in touch', style: 'primary' } },
      { type: 'button', props: { text: 'See our work', style: 'secondary' } },
    ],
  },
  fields: {
    align: { type: 'align', label: 'Alignment' },
    ...general,
  },
  tabs: { Style: ['align'], Advanced: ['anchor', 'hidden', 'label'] },
  render({ props, children, h, cls, root }) {
    return h`<div${root({ class: cls('ab-buttons', { 'ab-buttons--center': props.align === 'center' }) })}>${children}</div>`;
  },
});

export const button = defineElement({
  name: 'button',
  title: 'Button',
  group: 'Text',
  icon: 'button',
  css: 'buttons',
  allowedParents: ['buttons'],
  ai: 'One button inside a Buttons block. Attributes: text (2 to 4 words saying what happens, e.g. "Book a quote"), style (primary | secondary | text).',
  defaults: { style: 'primary' },
  fields: {
    text: {
      type: 'string',
      label: 'Button text',
      required: true,
      inline: true,
      hint: 'Say what happens when it\'s pressed, e.g. "Book a free quote" rather than "Click here".',
    },
    link: { type: 'link', label: 'Goes to', required: true },
    style: {
      type: 'select',
      label: 'Style',
      options: [
        { value: 'primary', label: 'Solid (main action)' },
        { value: 'secondary', label: 'Outline' },
        { value: 'text', label: 'Text link' },
      ],
    },
    newTab: {
      type: 'boolean',
      label: 'Open in a new tab',
      hint: 'Usually best left off. Useful for links to other websites or documents.',
    },
    ...general,
  },
  tabs: {
    Content: ['text', 'link'],
    Style: ['style', 'newTab'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  render({ props, h, cls, root, link, preview, problem }) {
    const label = String(props.text ?? '').trim();
    if (!label) return null;
    const href = link(props.link) || (preview ? '#' : null);
    if (!href) {
      problem(`The "${label}" button has nowhere to go yet.`, 'link');
      return null;
    }
    const classes = cls('ab-btn', `ab-btn--${props.style}`);
    const target = props.newTab ? { target: '_blank', rel: 'noopener' } : {};
    // Phone buttons ("Call 03 9000 0000") must never wrap mid-number.
    const text = href.startsWith('tel:') ? label.replace(/ /g, ' ') : label;
    return h`<a${root({ class: classes, href, ...target })}>${text}</a>`;
  },
});

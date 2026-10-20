import { defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'callout',
  title: 'Callout',
  group: 'Text',
  icon: 'callout',
  allowedParents: ['section', 'article'],
  ai: 'A highlighted box that stands out from the surrounding text. Attributes: variant (note | tip | warning | opinion), title (optional, a few words). Content: one or two short paragraphs.',
  defaults: { variant: 'note' },
  placeholder: {
    props: { title: 'Good to know', text: '<p>A short, useful point you want readers not to miss.</p>' },
  },
  fields: {
    title: { type: 'string', label: 'Title', inline: true, hint: 'Optional. A few words, e.g. "Our view" or "Before you start".' },
    text: { type: 'richtext', label: 'Text', required: true },
    variant: {
      type: 'select',
      label: 'Type',
      options: [
        { value: 'note', label: 'Note' },
        { value: 'tip', label: 'Tip' },
        { value: 'warning', label: 'Warning' },
        { value: 'opinion', label: 'Our opinion' },
      ],
    },
    ...general,
  },
  tabs: {
    Content: ['title', 'text'],
    Style: ['variant'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  render({ props, h, root, richText }) {
    const body = richText(props.text);
    if (!body.value && !props.title) return null;
    const title = props.title ? h`<p class="ab-callout__title">${props.title}</p>` : '';
    // role="note" rather than <aside>: an aside inside <main> is a separate
    // landmark, which screen-reader users would hear as page navigation.
    return h`<div${root({ class: `ab-callout ab-callout--${props.variant}`, role: 'note' })}>${title}<div class="ab-callout__body">${body}</div></div>`;
  },
});

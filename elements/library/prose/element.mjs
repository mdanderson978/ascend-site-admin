import { defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'prose',
  title: 'Text',
  group: 'Text',
  icon: 'text',
  allowedParents: ['section', 'article'],
  ai: 'Paragraphs of body text. May contain bold, italic, links, bulleted and numbered lists, and H2/H3 sub-headings (in articles). Never put styling, images or scripts in it.',
  placeholder: {
    props: {
      html: '<p>Write a few clear sentences here. Short paragraphs are easier to read on a phone.</p>',
    },
  },
  fields: {
    html: {
      type: 'richtext',
      headings: true,
      label: 'Text',
      required: true,
      hint: 'Paste from Word or Google Docs freely: formatting is tidied automatically so it always matches the site.',
    },
    ...general,
  },
  tabs: { Content: ['html'], Advanced: ['anchor', 'hidden', 'label'] },
  render({ props, h, root, richText }) {
    const body = richText(props.html, { headings: true });
    if (!body.value) return null;
    return h`<div${root({ class: 'ab-prose' })}>${body}</div>`;
  },
});

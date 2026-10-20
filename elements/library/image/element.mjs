import { defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'image',
  title: 'Image',
  group: 'Media',
  icon: 'image',
  allowedParents: ['section', 'article'],
  ai: 'A single photo with an optional caption. Leave the image empty and describe the photo needed in the "note" attribute; the editor uploads it.',
  defaults: { ratio: 'auto' },
  fields: {
    image: { type: 'image', label: 'Photo', required: true },
    alt: {
      type: 'string',
      label: 'Photo description',
      hint: 'Describe what the photo shows, for people using screen readers and for Google, e.g. "Freshly oiled timber deck at dusk".',
    },
    decorative: {
      type: 'boolean',
      label: 'Decoration only',
      hint: 'Tick this only if the photo adds nothing a visitor would miss (screen readers will skip it).',
    },
    caption: { type: 'string', label: 'Caption', hint: 'Optional line shown under the photo.' },
    link: { type: 'link', label: 'Link (optional)' },
    ratio: {
      type: 'select',
      label: 'Shape',
      hint: 'Crops the photo to a shape. The important part (its focal point) always stays in view.',
      options: [
        { value: 'auto', label: 'Original' },
        { value: 'landscape', label: 'Landscape (3:2)' },
        { value: 'wide', label: 'Wide (16:9)' },
        { value: 'square', label: 'Square' },
        { value: 'portrait', label: 'Portrait (4:5)' },
      ],
    },
    ...general,
  },
  tabs: {
    Content: ['image', 'alt', 'decorative', 'caption', 'link'],
    Style: ['ratio'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  async render({ props, h, cls, root, picture, link, problem }) {
    // A link's only name is the photo's description. Without one the link
    // would be unnamed for screen readers, so it's left off until there is one.
    let href = link(props.link);
    if (href && !String(props.alt ?? '').trim()) {
      problem('A linked photo needs a description so screen readers can say where the link goes. The link is left off until it has one.', 'alt');
      href = null;
    }
    const pic = await picture('image', {
      alt: props.alt,
      decorative: props.decorative && !href,
      className: cls('ab-image__img', { [`ab-image__img--${props.ratio}`]: props.ratio !== 'auto' }),
    });
    if (!pic) return null;
    const media = href ? h`<a class="ab-image__link" href="${href}">${pic}</a>` : pic;
    const caption = props.caption ? h`<figcaption class="ab-image__caption">${props.caption}</figcaption>` : '';
    return h`<figure${root({ class: 'ab-image' })}>${media}${caption}</figure>`;
  },
});

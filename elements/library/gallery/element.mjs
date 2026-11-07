import { defineElement, general } from '../../core/registry.mjs';

export const gallery = defineElement({
  name: 'gallery',
  title: 'Gallery',
  group: 'Media',
  icon: 'gallery',
  container: true,
  allowedParents: ['section', 'article'],
  ai: 'A set of related photos. Add one gallery_photo child per image, with specific alt text and an optional caption. Attributes: layout (grid | masonry), lightbox (open larger photos in an accessible dialog).',
  defaults: { layout: 'grid', lightbox: true },
  script: 'gallery',
  scripts: props => props.lightbox !== false ? ['gallery'] : [],
  placeholder: {
    children: [
      { type: 'gallery_photo', props: { image: 'sample-one', alt: 'Describe the first gallery photo', caption: 'Optional caption' } },
      { type: 'gallery_photo', props: { image: 'sample-two', alt: 'Describe the second gallery photo' } },
    ],
  },
  fields: {
    layout: {
      type: 'select',
      label: 'Layout',
      options: [
        { value: 'grid', label: 'Even grid' },
        { value: 'masonry', label: 'Masonry' },
      ],
    },
    lightbox: {
      type: 'boolean',
      label: 'Open photos larger',
      hint: 'Visitors can select a photo to view it in a keyboard-accessible overlay. The original image link still works without JavaScript.',
    },
    ...general,
  },
  tabs: {
    Style: ['layout', 'lightbox'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  childContext(props, ctx) {
    return { galleryLightbox: props.lightbox !== false, width: { ...(ctx.width || {}), fraction: 0.5 } };
  },
  render({ props, children, h, cls, root }) {
    return h`<div${root({ class: 'ab-gallery-shell' })}><div class="${cls('ab-gallery', `ab-gallery--${props.layout}`)}">${children}</div></div>`;
  },
});

export const galleryItem = defineElement({
  name: 'gallery_photo',
  title: 'Gallery photo',
  group: 'Media',
  icon: 'image',
  css: 'gallery',
  allowedParents: ['gallery'],
  ai: 'One photo inside a Gallery. Attributes: image (required), alt (required description of what is visible), caption (optional).',
  fields: {
    image: { type: 'image', label: 'Photo', required: true },
    alt: { type: 'string', label: 'Photo description', required: true, hint: 'Describe what this particular photo shows for visitors using screen readers.' },
    caption: { type: 'string', label: 'Caption', hint: 'Optional text shown below the photo.' },
    ...general,
  },
  tabs: {
    Content: ['image', 'alt', 'caption'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  async render({ props, ctx, h, root, picture, imageInfo }) {
    const alt = String(props.alt || '').trim();
    const photo = await picture('image', { alt, className: 'ab-gallery__image' });
    if (!photo) return null;
    let media = photo;
    if (ctx.galleryLightbox) {
      const info = await imageInfo('image');
      const href = info?.fallback?.url || info?.url || info?.avif?.at(-1)?.url;
      if (href) media = h`<a class="ab-gallery__open" href="${href}" data-ab-gallery-open aria-label="Open ${alt || 'this photo'} larger">${photo}</a>`;
    }
    const caption = props.caption ? h`<figcaption class="ab-gallery__caption">${props.caption}</figcaption>` : '';
    return h`<figure${root({ class: 'ab-gallery__item' })}>${media}${caption}</figure>`;
  },
});

import { defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'cta',
  title: 'Call to action',
  group: 'Site',
  icon: 'cta',
  container: true,
  allowedParents: ['layout', 'section', 'article'],
  ai: 'A focused call-to-action band with a heading, short supporting text, optional phone number and button children. Attributes: variant (mid | final). Use mid within content or final near the end of a page.',
  defaults: { variant: 'mid' },
  placeholder: {
    props: { heading: 'Ready to get started?', text: '<p>Tell readers the next step and why it is worth taking.</p>', phone: '03 9000 0000' },
    children: [{ type: 'button', props: { text: 'Get in touch', style: 'primary' } }],
  },
  fields: {
    heading: { type: 'string', label: 'Heading', required: true, inline: true },
    text: { type: 'richtext', label: 'Text', hint: 'Keep this to one or two short sentences.' },
    phone: { type: 'string', label: 'Phone number', hint: 'Optional. Shown as a tap-to-call link.' },
    variant: {
      type: 'select',
      label: 'Position',
      options: [
        { value: 'mid', label: 'Within the page' },
        { value: 'final', label: 'Final call to action' },
      ],
    },
    ...general,
  },
  tabs: {
    Content: ['heading', 'text', 'phone'],
    Style: ['variant'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  keepEmpty: props => !!(props.heading || props.text || props.phone),
  render({ props, children, ctx, h, cls, root, richText, headingId, problem }) {
    const heading = String(props.heading || '').trim();
    const body = richText(props.text);
    const phoneText = String(props.phone || '').trim();
    const phoneNumber = phoneText.replace(/[^\d+]/g, '');
    if (phoneText && !/\d/.test(phoneNumber)) problem('The phone number needs at least one number.', 'phone');
    if (!heading && !body.value && !/\d/.test(phoneNumber) && !children.value.trim()) return null;
    if (!heading) problem('A call to action needs a heading.', 'heading');
    const id = heading ? headingId(heading) : null;
    const title = heading ? h`<h2 class="ab-cta__heading" id="${id}">${heading}</h2>` : '';
    const text = body.value ? h`<div class="ab-cta__text">${body}</div>` : '';
    const phoneHref = /\d/.test(phoneNumber) ? `tel:${phoneNumber}` : '';
    const phone = phoneHref ? h`<a class="ab-cta__phone" href="${phoneHref}">${phoneText.replace(/ /g, ' ')}</a>` : '';
    const actions = children.value.trim() ? h`<div class="ab-cta__actions">${children}</div>` : '';
    const pageBand = ctx.parentType === 'layout';
    const classes = cls('ab-cta', `ab-cta--${props.variant}`, { 'ab-cta--page': pageBand });
    const content = h`<div class="ab-cta__inner">${title}${text}${phone}${actions}</div>`;
    return pageBand && id
      ? h`<section${root({ class: classes, 'aria-labelledby': id })}>${content}</section>`
      : h`<div${root({ class: classes })}>${content}</div>`;
  },
});

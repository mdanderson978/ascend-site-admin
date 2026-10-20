import { defineElement, general } from '../../core/registry.mjs';

export default defineElement({
  name: 'article',
  title: 'Article',
  group: 'Layout',
  icon: 'article',
  container: true,
  allowedParents: ['layout', 'section'],
  ai: 'Long-form reading content at a comfortable reading width: text (prose) with components such as callouts and FAQs placed between paragraphs.',
  fields: { ...general },
  tabs: { Advanced: ['anchor', 'hidden', 'label'] },
  childContext(props, ctx, host) {
    return { width: { max: host.narrowMax, fraction: 1 } };
  },
  render({ ctx, children, h, cls, root }) {
    return h`<div${root({ class: cls('ab-article', { 'ab-article--page': ctx.parentType === 'layout' }) })}>${children}</div>`;
  },
});

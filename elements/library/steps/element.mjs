import { defineElement, general } from '../../core/registry.mjs';

export const steps = defineElement({
  name: 'steps',
  title: 'Steps',
  group: 'Repeatable',
  icon: 'steps',
  container: true,
  allowedParents: ['section', 'article'],
  ai: 'An ordered sequence of instructions. Add one step child for each action and keep the order meaningful.',
  placeholder: {
    children: [
      { type: 'step', props: { title: 'Start here', text: '<p>Explain the first action clearly.</p>' } },
      { type: 'step', props: { title: 'Then do this', text: '<p>Explain the next action.</p>' } },
    ],
  },
  fields: { ...general },
  tabs: { Advanced: ['anchor', 'hidden', 'label'] },
  render({ children, h, root }) {
    return h`<ol${root({ class: 'ab-steps' })}>${children}</ol>`;
  },
});

export const step = defineElement({
  name: 'step',
  title: 'Step',
  group: 'Repeatable',
  icon: 'step',
  css: 'steps',
  allowedParents: ['steps'],
  ai: 'One action inside a Steps block. Attribute: title (required, short and action-oriented). Content: a concise explanation.',
  fields: {
    title: { type: 'string', label: 'Title', required: true, inline: true },
    text: { type: 'richtext', label: 'Instructions', required: true },
    ...general,
  },
  tabs: {
    Content: ['title', 'text'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  render({ props, h, root, richText }) {
    const title = String(props.title || '').trim();
    const text = richText(props.text);
    if (!title || !text.value) return null;
    return h`<li${root({ class: 'ab-steps__item' })}><div class="ab-steps__content"><strong class="ab-steps__title">${title}</strong><div class="ab-steps__text">${text}</div></div></li>`;
  },
});

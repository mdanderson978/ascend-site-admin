import { defineElement, general } from '../../core/registry.mjs';

export const faq = defineElement({
  name: 'faq',
  title: 'FAQ',
  group: 'Repeatable',
  icon: 'faq',
  container: true,
  allowedParents: ['section', 'article'],
  ai: 'A list of frequently asked questions, each opening to show its answer. Use the questions customers really ask; keep answers to a short paragraph or two.',
  defaults: { schema: true },
  placeholder: {
    children: [
      { type: 'faq_item', props: { question: 'How long does it take?', answer: '<p>Give a straight answer first, then any detail.</p>' } },
      { type: 'faq_item', props: { question: 'What does it cost?', answer: '<p>Explain what the price depends on.</p>' } },
    ],
  },
  fields: {
    schema: {
      type: 'boolean',
      label: 'Tell Google these are FAQs',
      hint: 'Adds FAQ structured data so search engines understand these questions and answers. Leave on unless a developer advises otherwise.',
    },
    ...general,
  },
  tabs: { Content: ['schema'], Advanced: ['anchor', 'hidden', 'label'] },
  childContext(props) {
    return { faqSchema: props.schema !== false };
  },
  render({ children, h, root }) {
    return h`<div${root({ class: 'ab-faq' })}>${children}</div>`;
  },
});

export const faqItem = defineElement({
  name: 'faq_item',
  title: 'Question',
  group: 'Repeatable',
  icon: 'question',
  css: 'faq',
  allowedParents: ['faq'],
  ai: 'One question and its answer inside an FAQ block. Attribute: question. Content: the answer.',
  fields: {
    question: { type: 'string', label: 'Question', required: true, inline: true },
    answer: { type: 'richtext', label: 'Answer', required: true },
    open: { type: 'boolean', label: 'Show the answer open', hint: 'Usually left off so the list stays short.' },
    ...general,
  },
  tabs: {
    Content: ['question', 'answer'],
    Style: ['open'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  render({ props, ctx, h, root, richText, collect, isPlaceholder }) {
    const question = String(props.question ?? '').trim();
    const answer = richText(props.answer);
    if (!question || !answer.value) return null;
    if (ctx.faqSchema !== false && !isPlaceholder) collect('faq', { question, answer: answer.value });
    return h`<details${root({ class: 'ab-faq__item', open: !!props.open })}><summary class="ab-faq__q">${question}</summary><div class="ab-faq__a">${answer}</div></details>`;
  },
});

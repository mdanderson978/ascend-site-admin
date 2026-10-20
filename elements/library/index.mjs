// The fleet-wide element library. Every site gets exactly these elements;
// sites differ through brand tokens and their own CSS, never through
// per-site copies of an element.

import { createRegistry } from '../core/registry.mjs';
import article from './article/element.mjs';
import { button, buttons } from './buttons/element.mjs';
import callout from './callout/element.mjs';
import { faq, faqItem } from './faq/element.mjs';
import heading from './heading/element.mjs';
import image from './image/element.mjs';
import prose from './prose/element.mjs';
import section from './section/element.mjs';

export const builtinElements = [section, article, heading, prose, image, buttons, button, callout, faq, faqItem];

export const defaultRegistry = createRegistry(builtinElements);

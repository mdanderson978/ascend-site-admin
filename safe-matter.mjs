// gray-matter, with JavaScript front matter switched off.
//
// By default gray-matter treats a file that opens with `---js` (or `---JS`,
// `---javascript`, ...) as JavaScript and runs it with eval(). Content files
// are data that anyone with write access to a content repo can change, and
// the admin reads them on the client's own computer, so a content file must
// never be able to run code. Every casing of "js"/"javascript" resolves to
// gray-matter's single `javascript` engine, so replacing that engine closes
// the hole; YAML (the default) and JSON keep working exactly as before.
//
// Use this module everywhere instead of importing gray-matter directly.

import grayMatter from 'gray-matter';

export class UnsafeFrontMatterError extends Error {
  constructor() {
    super('This file starts with JavaScript front matter (---js), which is never run. Front matter must be YAML.');
    this.name = 'UnsafeFrontMatterError';
  }
}

const refuse = {
  parse() {
    throw new UnsafeFrontMatterError();
  },
  stringify() {
    throw new UnsafeFrontMatterError();
  },
};

const ENGINES = { javascript: refuse, js: refuse };

export default function matter(input, options = {}) {
  return grayMatter(input, { ...options, engines: { ...(options.engines || {}), ...ENGINES } });
}

matter.stringify = (file, data, options = {}) =>
  grayMatter.stringify(file, data, { ...options, engines: { ...(options.engines || {}), ...ENGINES } });

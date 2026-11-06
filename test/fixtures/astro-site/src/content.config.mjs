import { defineCollection } from 'astro:content';
import { pathToFileURL } from 'node:url';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { layoutSchema } from 'site-admin/elements';

export const collections = {
  pages: defineCollection({
    loader: glob({ pattern: '*.md', base: pathToFileURL(`${process.env.CONTENT_ROOT}/src/content/pages/`) }),
    schema: z.object({ title: z.string(), layout: layoutSchema(z).optional() }),
  }),
};

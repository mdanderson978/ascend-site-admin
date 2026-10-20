// Zod schema for a stored layout, for the source repo's content.config.ts:
//
//   import { z } from 'astro/zod';
//   import { layoutSchema } from 'site-admin/elements';
//   const pages = defineCollection({ schema: z.object({ layout: layoutSchema(z).optional(), ... }) });
//
// `z` is passed in so the engine doesn't depend on (or pin) a zod version.
// This checks the tree's shape only; per-element validation happens in the
// engine's own save and render stages, which report readable problems
// instead of failing the build on a single bad prop.

export function layoutSchema(z) {
  const node = z.lazy(() =>
    z
      .object({
        type: z.string().min(1),
        id: z.string().optional(),
        props: z.record(z.string(), z.unknown()).optional(),
        children: z.array(node).optional(),
      })
      .passthrough(),
  );
  return z.object({
    schema: z.number().int().positive().optional(),
    children: z.array(node).default([]),
  });
}

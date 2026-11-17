import { defineConfig } from 'tsup';

// Two entries, dual ESM+CJS.
//
// `index` (the package root) is the plugins, the slug and link grammars, and the layout
// grammar: pure mdast transforms with no runtime dependency (the `unified` import is
// type-only, erased at compile). The transpiler's `compile.ts` and the SDK's safe
// renderer (`parseSafeMdast`) import it.
//
// `frontmatter` (`@immediately-run/mdx-plugins/frontmatter`, R3-1347) is `parseFrontmatter`
// and its fixture, which need `yaml` at runtime. tsup leaves `dependencies` external, so
// `yaml` is imported, not bundled, at the exact version package.json pins. It is a
// separate entry, not a root export, because `yaml` declares no `sideEffects` and so is
// never tree-shaken: as a root export it added about 44 KB minified to every bundle that
// imports the root, used or not (measured with esbuild on a plugins-only consumer:
// 16.5 KB before, 61 KB after). `test/entrySize.test.mjs` holds that line.
//
// `splitting: false` keeps each entry's ESM and CJS files self-contained.
export default defineConfig({
  entry: { index: 'src/index.ts', frontmatter: 'src/frontmatterEntry.ts' },
  format: ['esm', 'cjs'],
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
});

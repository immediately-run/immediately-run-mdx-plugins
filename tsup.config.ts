import { defineConfig } from 'tsup';

// One entry, dual ESM+CJS — both consumers import the public API from the package
// root: the transpiler's `compile.ts` (ESM+CJS builds) and the SDK's safe renderer
// (`parseSafeMdast`, ESM+CJS builds). The plugins are pure mdast transforms with no
// runtime dependency (the `unified` import is type-only, erased at compile), so there
// is nothing to keep `external` and no heavy graph is pulled into a consumer.
// `splitting: false` keeps `dist/index.js` and `dist/index.cjs` self-contained.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
});

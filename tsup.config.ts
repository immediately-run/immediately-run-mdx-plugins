import { defineConfig } from 'tsup';

// One entry, dual ESM+CJS — both consumers import the public API from the package
// root: the transpiler's `compile.ts` (ESM+CJS builds) and the SDK's safe renderer
// (`parseSafeMdast`, ESM+CJS builds). The plugins are pure mdast transforms (the
// `unified` import is type-only, erased at compile). The one runtime dependency is
// `yaml`, for `parseFrontmatter` (R3-1347): tsup leaves `dependencies` external, so it
// is imported, not bundled, and its exact pin in package.json is the version every
// consumer runs. A consumer that never imports `parseFrontmatter` tree-shakes it away
// (`sideEffects: false`). `splitting: false` keeps `dist/index.js` and `dist/index.cjs`
// self-contained apart from that import.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
});

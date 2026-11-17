// `@immediately-run/mdx-plugins/frontmatter` — the frontmatter surface, on its own subpath
// (R3-1347).
//
// WHY A SUBPATH. `parseFrontmatter` needs `yaml` at runtime, and `yaml` declares no
// `sideEffects`, so a bundler keeps all of it in any bundle that imports a module importing
// it — tree-shaking does not remove it. Exported from the package root, it added about
// 44 KB minified (33 KB of `yaml`, the rest the fixture's data) to every consumer, the SDK's
// safe renderer included, which uses none of it. On this subpath only the readers of a
// corpus pay for it: the transpiler, Grove, the docs checker, kanban.
export { parseFrontmatter } from './frontmatter';
export type {
  FrontmatterError,
  FrontmatterParseResult,
  FrontmatterValue,
  ParsedFrontmatter,
} from './frontmatter';
export { FRONTMATTER_PARITY_FIXTURE } from './frontmatterFixture';
export type { FrontmatterCase } from './frontmatterFixture';

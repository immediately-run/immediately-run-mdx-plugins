// R3-1347 review 1-A-0 — the package root stays free of `yaml`.
//
// `yaml` declares no `sideEffects`, so a bundler keeps all of it in any bundle that reaches
// a module importing it; tree-shaking does not help. As a root export, `parseFrontmatter`
// grew a plugins-only consumer from 16.5 KB to 61 KB minified (esbuild), the SDK's safe
// renderer included. It therefore lives on `@immediately-run/mdx-plugins/frontmatter`, and
// these assertions hold the line on the BUILT files — what a consumer actually resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dist = (f) => readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8');
const IMPORTS_YAML = /from\s*["']yaml["']|require\(\s*["']yaml["']\s*\)/;

test('the root build imports no yaml and carries no frontmatter fixture', () => {
  for (const f of ['index.js', 'index.cjs']) {
    const code = dist(f);
    assert.doesNotMatch(code, IMPORTS_YAML, `${f} must not import yaml`);
    assert.ok(!code.includes('real-okf-ga4-events'), `${f} must not inline the fixture`);
  }
});

test('the frontmatter subpath is where yaml is imported', () => {
  for (const f of ['frontmatter.js', 'frontmatter.cjs']) {
    assert.match(dist(f), IMPORTS_YAML, `${f} imports yaml`);
  }
});

test('package.json exports the subpath to the built files', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.exports['./frontmatter'], {
    types: './dist/frontmatter.d.ts',
    import: './dist/frontmatter.js',
    require: './dist/frontmatter.cjs',
  });
});

test('the root entry no longer exports the frontmatter surface', async () => {
  const root = await import('../dist/index.js');
  assert.equal(root.parseFrontmatter, undefined);
  assert.equal(root.FRONTMATTER_PARITY_FIXTURE, undefined);
  const sub = await import('../dist/frontmatter.js');
  assert.equal(typeof sub.parseFrontmatter, 'function');
});

#!/usr/bin/env node
/*
 * Generate `llms.txt` — a single-fetch, plain-Markdown map of this package's public
 * API for coding agents and humans (llmstxt.org convention; ported from the SDK's
 * `scripts/gen-llms.mjs`, R3-279's packaging making the package public API).
 *
 * Reads TypeDoc's JSON (emitted by `npm run docs`) so it stays in sync with the code.
 *
 * Usage:
 *   node scripts/gen-llms.mjs            (after typedoc; writes llms.txt)
 *   node scripts/gen-llms.mjs --check    (fail if the committed llms.txt is stale)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiJsonPath = resolve(root, 'docs/api.json');
const outPath = resolve(root, 'llms.txt');

if (!existsSync(apiJsonPath)) {
  console.error('error: docs/api.json not found — run `typedoc --json docs/api.json` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const api = JSON.parse(readFileSync(apiJsonPath, 'utf8'));

const KIND = {
  64: 'function',
  32: 'const',
  256: 'interface',
  2097152: 'type',
  128: 'class',
  8: 'enum',
  4: 'namespace',
};

const summary = (c) => {
  const parts = c.comment?.summary ?? c.signatures?.find((s) => s.comment)?.comment?.summary;
  if (!parts) return '';
  const text = parts.map((p) => p.text ?? '').join('');
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].trim();
};

const isDeprecated = (c) => {
  const tags = [...(c.comment?.blockTags ?? []), ...(c.signatures?.find((s) => s.comment)?.comment?.blockTags ?? [])];
  return tags.some((t) => t.tag === '@deprecated');
};

const lines = [];
lines.push(`# ${pkg.name}`);
lines.push('');
lines.push(`> ${pkg.description} (v${pkg.version})`);
lines.push('');
lines.push(
  'The grammar + resolution canon shared by every immediately.run render path: the ' +
    'transpiler\'s compiled MDX, the safe renderer, Grove\'s runtime, and the docs ' +
    'corpus checker all import THESE implementations — a wiki-link, heading anchor, or ' +
    'link resolution means the same byte everywhere.',
);
lines.push('');
// Each entry point is an import path (package.json `exports`). With one entry TypeDoc lists
// the exports at the top level; with several it nests them under one module (kind 2) per
// entry, named after the entry file. A module missing from this table fails loudly rather
// than printing exports under a path nobody can import.
const IMPORT_PATH = {
  index: pkg.name,
  frontmatterEntry: `${pkg.name}/frontmatter`,
};
const modules = (api.children ?? []).some((c) => c.kind === 2)
  ? api.children.filter((c) => c.kind === 2)
  : [{ name: 'index', children: api.children ?? [] }];
modules.sort((a, b) => (a.name === 'index' ? -1 : b.name === 'index' ? 1 : a.name.localeCompare(b.name)));
for (const m of modules) {
  const path = IMPORT_PATH[m.name];
  if (!path) {
    console.error(`error: TypeDoc module "${m.name}" has no import path in scripts/gen-llms.mjs IMPORT_PATH.`);
    process.exit(1);
  }
  lines.push(m.name === 'index' ? '## Exports' : `## Exports from \`${path}\``);
  lines.push('');
  for (const c of m.children ?? []) {
    if (!KIND[c.kind]) continue;
    const s = summary(c);
    lines.push(`- \`${c.name}\` (${KIND[c.kind]})${isDeprecated(c) ? ' **[DEPRECATED]**' : ''}${s ? ' — ' + s : ''}`);
  }
  lines.push('');
}
lines.push('## The parity fixtures');
lines.push('');
lines.push(
  '`SLUG_PARITY_FIXTURE`, `LINK_SPACE_FIXTURE` and (from the `/frontmatter` subpath) ' +
    '`FRONTMATTER_PARITY_FIXTURE` are published DATA, not tests-in-disguise: ' +
    'every consumer (the plugin here, Grove\'s runtime, the docs checker) asserts its own ' +
    'outcome against the same cases, so disagreement is a failing test in whichever repo ' +
    'drifted. If you derive a heading id or resolve a link, you are contractually comparing ' +
    'against these.',
);
lines.push('');
lines.push('---');
lines.push('_Generated from the typed API by `scripts/gen-llms.mjs`; regenerate on export changes (verify checks freshness)._');

const content = lines.join('\n') + '\n';

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(outPath, 'utf8');
  } catch {
    console.error('error: llms.txt missing — run `npm run docs` and commit it.');
    process.exit(1);
  }
  if (committed !== content) {
    console.error('error: llms.txt is stale — run `npm run docs` and commit the result.');
    process.exit(1);
  }
  console.log('OK llms.txt is current.');
} else {
  writeFileSync(outPath, content);
  console.log(`✓ Wrote ${outPath}.`);
}

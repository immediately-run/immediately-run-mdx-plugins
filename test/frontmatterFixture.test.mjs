// R3-1347 — the fixture's own shape: every input shape has a case, names are unique, and
// the two real-bytes cases are present. The expectations themselves are checked against
// `yaml.parse` by `scripts/gen-frontmatter-fixture.mjs --check` (in `verify`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRONTMATTER_PARITY_FIXTURE } from '../dist/frontmatter.js';

// The shapes R3-1347 names, one case each. Adding a shape adds a name here and a case.
const SHAPES = [
  'plain-string', 'integer', 'float', 'boolean', 'empty-value', 'date-stays-string',
  'quoted-escapes', 'flow-list', 'block-list', 'list-of-maps', 'nested-three-levels',
  'flow-map', 'multi-line-plain', 'block-scalars', 'comment-line', 'crlf', 'bom',
  'fence-trailing-spaces', 'empty-block', 'comments-only', 'unclosed', 'no-frontmatter',
  'duplicate-key', 'bad-escape', 'list-document', 'explicit-tags',
];
const REAL = ['real-grove-hero-unquoted', 'real-okf-ga4-events'];

test('case names are unique, and every named shape has a case', () => {
  const names = FRONTMATTER_PARITY_FIXTURE.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'no duplicate names');
  for (const shape of [...SHAPES, ...REAL]) assert.ok(names.includes(shape), `missing case: ${shape}`);
});

test('both outcomes are exercised: data, and each error kind', () => {
  const kinds = new Set(FRONTMATTER_PARITY_FIXTURE.map((c) => c.expected.errorKind ?? 'ok'));
  for (const k of ['ok', 'yaml', 'not-a-map', 'not-json']) assert.ok(kinds.has(k), `no case ends ${k}`);
});

test('a declared block is part of its source, and only frontmatter cases declare one', () => {
  for (const c of FRONTMATTER_PARITY_FIXTURE) {
    if (c.block === null) {
      assert.equal(c.expected.hadFrontmatter, false, c.name);
    } else {
      assert.ok(c.source.includes(c.block), c.name);
      assert.equal(c.expected.hadFrontmatter, true, c.name);
    }
  }
});

test('the real-bytes cases say where their bytes came from', () => {
  for (const name of REAL) {
    const c = FRONTMATTER_PARITY_FIXTURE.find((x) => x.name === name);
    assert.match(c.why, /^REAL BYTES: .+ at [0-9a-f]{7}/, name);
  }
});

// R3-1347 — `parseFrontmatter` against its published fixture.
//
// The fixture's expectations come from `yaml.parse` on each case's declared block
// (`scripts/gen-frontmatter-fixture.mjs`), so this asserts the agreement with the host's
// parser itself: the fence finds the same block, and the block parses to the same value.
// The transpiler runs this same fixture against its own export (R3-1348).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRONTMATTER_PARITY_FIXTURE, parseFrontmatter } from '../dist/index.js';

test('every fixture case parses to its expectation', () => {
  for (const c of FRONTMATTER_PARITY_FIXTURE) {
    const r = parseFrontmatter(c.source);
    assert.deepEqual(r.data, c.expected.data, `${c.name} — ${c.why}`);
    assert.equal(r.hadFrontmatter, c.expected.hadFrontmatter, `${c.name}: hadFrontmatter`);
    assert.equal(r.error?.kind, c.expected.errorKind, `${c.name}: error kind`);
  }
});

test('it never throws, whatever the input', () => {
  const extra = ['', '---', '---\n', '---\n---', '﻿', '---\n: :\n---\n', '---\n&a [*a]\n---\n'];
  for (const src of [...FRONTMATTER_PARITY_FIXTURE.map((c) => c.source), ...extra]) {
    assert.doesNotThrow(() => parseFrontmatter(src), JSON.stringify(src));
  }
});

test('an error is positioned in the document, not in the block', () => {
  // The real `hero.mdx`: the fence is line 1, `layoutRole` 2, `nav: top` 3, and the
  // `description:` holding `(nav: top; …)` mid-line is line 4 — where a checker must point.
  const hero = FRONTMATTER_PARITY_FIXTURE.find((c) => c.name === 'real-grove-hero-unquoted');
  const r = parseFrontmatter(hero.source);
  assert.equal(r.error?.kind, 'yaml');
  assert.equal(r.error?.line, 4);
  assert.equal(typeof r.error?.column, 'number');
  assert.doesNotMatch(r.error.message, /\n|at line \d+/, 'one line, position carried separately');
  assert.deepEqual(r.data, {});
});

test('a block that is not a map says so', () => {
  const r = parseFrontmatter('---\n- a\n- b\n---\nbody');
  assert.equal(r.error?.kind, 'not-a-map');
  assert.match(r.error.message, /a list/);
  assert.equal(r.body, 'body');
});

test('content is the untrimmed remainder; body trims leading blank lines', () => {
  const crlf = FRONTMATTER_PARITY_FIXTURE.find((c) => c.name === 'crlf');
  const r = parseFrontmatter(crlf.source);
  assert.equal(r.content, '\r\nBody.\r\n', 'CRLF kept, the blank line kept');
  assert.equal(r.body, 'Body.\r\n');

  const lf = parseFrontmatter('---\ntitle: x\n---\n\n\n# Heading\n');
  assert.equal(lf.content, '\n\n# Heading\n');
  assert.equal(lf.body, '# Heading\n');
});

test('a BOM is not part of content; with no frontmatter, body is the input as given', () => {
  const bom = parseFrontmatter('﻿---\ntitle: x\n---\nBody.\n');
  assert.equal(bom.data.title, 'x');
  assert.equal(bom.content, 'Body.\n');

  const plain = '﻿# Heading\n';
  const r = parseFrontmatter(plain);
  assert.equal(r.hadFrontmatter, false);
  assert.equal(r.body, plain);
  assert.equal(r.content, '# Heading\n');
  assert.equal(r.error, undefined);
});

// R3-1347 — `parseFrontmatter` against its published fixture.
//
// The fixture's expectations come from `yaml.parse` on each case's declared block
// (`scripts/gen-frontmatter-fixture.mjs`), so this asserts the agreement with the host's
// parser itself: the fence finds the same block, and the block parses to the same value.
// The transpiler runs this same fixture against its own export (R3-1348).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRONTMATTER_PARITY_FIXTURE, parseFrontmatter } from '../dist/frontmatter.js';

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

test('a block that is not a map says so, and points at the node', () => {
  const r = parseFrontmatter('---\n- a\n- b\n---\nbody');
  assert.equal(r.error?.kind, 'not-a-map');
  assert.match(r.error.message, /a list/);
  assert.deepEqual([r.error.line, r.error.column], [2, 1]);
  assert.equal(r.body, 'body');

  // Review 1-B-0: a comment and a blank line before the list move it to line 4, column 3.
  const later = parseFrontmatter('---\n# a comment\n\n  - a\n---\n');
  assert.equal(later.error?.kind, 'not-a-map');
  assert.deepEqual([later.error.line, later.error.column], [4, 3]);

  const scalar = parseFrontmatter('---\n# c\njust words\n---\n');
  assert.match(scalar.error.message, /a string/);
  assert.deepEqual([scalar.error.line, scalar.error.column], [3, 1]);
});

test('a value outside the JSON set is an error naming its key path, never a Date or a Set in data', () => {
  // Review 1-A-1: with no options, yaml honours explicit tags — `!!timestamp` builds a
  // Date, `!!binary` a byte array, `!!set` a Set — none of which a FrontmatterValue is.
  for (const [src, path, what] of [
    ['---\npublished: !!timestamp 2026-01-01\n---\n', 'published', /Date/],
    ['---\nmeta:\n  raw: !!binary aGVsbG8=\n---\n', 'meta.raw', /Uint8Array|Buffer/],
    ['---\ntags: [a, !!set {x, y}]\n---\n', 'tags[1]', /Set/],
  ]) {
    const r = parseFrontmatter(src);
    assert.equal(r.error?.kind, 'not-json', src);
    assert.deepEqual(r.data, {}, src);
    assert.ok(r.error.message.includes(`\`${path}\``), `${src}: names ${path} — ${r.error.message}`);
    assert.match(r.error.message, what, src);
  }
  // An untagged date stays a string, so ordinary frontmatter never meets this error.
  assert.deepEqual(parseFrontmatter('---\ndate: 2026-01-01\n---\n').data, { date: '2026-01-01' });
});

test('deeply nested input fails bounded, with yaml\'s own code (GHSA-48c2-rrv3-qjmp)', () => {
  // yaml < 2.8.3 recursed without a bound and died with a raw RangeError; 2.8.3+ answers a
  // positioned YAMLParseError coded RESOURCE_EXHAUSTION. The parse moved here from the
  // transpiler (R3-1347), so the regression test moved with it. `code` is what tells the
  // two apart: parseFrontmatter catches both, but only yaml's own error carries a code.
  const depth = 10_000;
  const evil = `---\na: ${'['.repeat(depth)}${']'.repeat(depth)}\n---\n\n# Title\n`;
  const r = parseFrontmatter(evil);
  assert.equal(r.error?.kind, 'yaml');
  assert.equal(r.error?.code, 'RESOURCE_EXHAUSTION');
  assert.equal(r.error?.line, 2);
  assert.deepEqual(r.data, {});
});

test('an ordinary YAML error carries its code too', () => {
  assert.equal(parseFrontmatter('---\nid: a\nid: b\n---\n').error?.code, 'DUPLICATE_KEY');
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

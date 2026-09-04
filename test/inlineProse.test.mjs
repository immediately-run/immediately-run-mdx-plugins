// R3-531 — the inline-prose grammar, asserted against the CANON here.
//
// The reference assertion, in the slugParity shape: the fixture is published so
// Grove's parity test (against the SDK safe renderer's real micromark path)
// imports the same cases, and the one real-corpus input is read through
// `parseFrontmatter` — the field producer feeds the parser, not a hand-typed
// near-copy of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INLINE_PROSE_FIXTURE,
  parseFrontmatter,
  parseInlineProse,
  plainProse,
} from '../dist/index.js';

test('the fixture describes THIS package (the canon)', () => {
  for (const c of INLINE_PROSE_FIXTURE) {
    assert.deepEqual(parseInlineProse(c.text), c.tokens, `parseInlineProse(${JSON.stringify(c.text)}) — ${c.why}`);
    assert.equal(plainProse(c.text), c.plain, `plainProse(${JSON.stringify(c.text)}) — ${c.why}`);
  }
});

test('the failure behaviour: a non-string throws, the empty string does not', () => {
  assert.throws(() => parseInlineProse(42), TypeError, 'parseInlineProse(number)');
  assert.throws(() => parseInlineProse(null), TypeError, 'parseInlineProse(null)');
  assert.throws(() => plainProse(undefined), TypeError, 'plainProse(undefined)');
  assert.deepEqual(parseInlineProse(''), []);
  assert.equal(plainProse(''), '');
});

test('plainProse is the marker-free form of parseInlineProse', () => {
  // For every fixture case, the plain form equals the walk of the tokens — the
  // two exports cannot disagree about what is marker and what is content.
  const walk = (nodes) =>
    nodes.map((n) => (n.type === 'strong' || n.type === 'emphasis' ? walk(n.children) : n.value)).join('');
  for (const c of INLINE_PROSE_FIXTURE) {
    assert.equal(walk(parseInlineProse(c.text)), c.plain, c.why);
  }
});

test('the fixture is non-vacuous: it covers every branch of the grammar', () => {
  const has = (pred) => INLINE_PROSE_FIXTURE.some(pred);
  assert.ok(has((c) => c.tokens.some((n) => n.type === 'code')), 'a code span');
  assert.ok(has((c) => c.tokens.some((n) => n.type === 'code' && n.value.includes('`'))), 'a backtick inside a code span');
  assert.ok(has((c) => c.tokens.some((n) => n.type === 'strong')), 'strong');
  assert.ok(has((c) => c.tokens.some((n) => n.type === 'emphasis')), 'emphasis');
  assert.ok(
    has((c) => c.tokens.some((n) => n.type === 'strong' && n.children.some((k) => k.type === 'emphasis'))),
    'emphasis nested in strong',
  );
  assert.ok(has((c) => c.tokens.length === 1 && c.tokens[0].type === 'text' && c.tokens[0].value.includes('`')), 'an unbalanced backtick kept literal');
  assert.ok(has((c) => c.text === ''), 'the empty string');
  assert.ok(has((c) => c.tokens.length === 1 && c.tokens[0].type === 'text' && !/[*_`]/.test(c.text)), 'a no-marker string');
  // The shapes the round-1 review proved a flanking approximation wrong on:
  // the fixture must keep pinning them, or the parity contract is silent on
  // exactly where a paraphrase diverges.
  assert.ok(has((c) => /[\p{P}\p{S}]/u.test(c.text.replace(/\s|[*_`]|[^*_`\s\p{P}\p{S}]/gu, '')) && c.tokens.some((n) => n.type === 'text' && /[*_]/.test(n.value))), 'a punctuation-adjacent delimiter kept literal');
  assert.ok(
    has((c) => c.tokens.some((n) => n.type === 'strong' && n.children.some((k) => k.type === 'emphasis'))) ||
      has((c) => c.tokens.some((n) => n.type === 'emphasis' && n.children.some((k) => k.type === 'strong'))),
    'strong and emphasis nesting in both directions',
  );
  assert.ok(has((c) => c.tokens.some((n) => n.type === 'emphasis' && n.children.some((k) => k.type === 'code'))), 'emphasis spanning a code span');
  assert.ok(has((c) => /[^ -~]/.test(c.text)), 'a non-ASCII string (the Unicode intraword rule)');
});

test('one input is the real R3-410 title, read from the corpus through parseFrontmatter', async () => {
  // The frontmatter is COPIED into the package so the case does not depend on a
  // sibling checkout (the corpus is docs-repo content; this is a published npm
  // package). The copy is byte-identical to the file the defect was measured on.
  const doc = readFileSync(new URL('./fixtures/R3-410-frontmatter.mdx', import.meta.url), 'utf8');
  const { data, hadFrontmatter } = parseFrontmatter(doc);
  assert.ok(hadFrontmatter);
  const title = data.title;
  assert.equal(typeof title, 'string');
  // It IS the fixture's real-title case — the fixture cannot rot away from the
  // corpus, because this assertion re-derives the case from the copied field.
  const realCase = INLINE_PROSE_FIXTURE.find((c) => c.text === title);
  assert.ok(realCase, 'the copied title must appear verbatim in INLINE_PROSE_FIXTURE');
  assert.deepEqual(parseInlineProse(title), realCase.tokens);
  assert.match(plainProse(title), /cache\.yml self-provisioning/);
  assert.ok(!plainProse(title).includes('`'), 'the plain form drops the backticks');
});

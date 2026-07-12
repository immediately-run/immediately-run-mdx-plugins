// Unit tests for the shared plugins — the slug grammar and each plugin's mdast
// transform in isolation (no MDX compile pipeline). The full end-to-end / byte-identity
// coverage lives in the transpiler (parity.test.mjs, heading-anchors/wikilinks/
// admonitions.test.mjs via compileMdx) and the SDK (safe-renderer cross-path parity);
// these guard the extracted source directly.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  textSlug,
  sectionId,
  remarkHeadingAnchors,
  remarkWikiLinks,
  remarkAdmonitions,
} from '../dist/index.js';

// ── slug grammar (byte-exact citation targets) ───────────────────────────────
test('textSlug: GitHub-compatible', () => {
  assert.equal(textSlug('Getting Started'), 'getting-started');
  assert.equal(textSlug('The **bold** heading'), 'the-bold-heading');
  assert.equal(textSlug('  Trim & punctuation!  '), 'trim-punctuation');
});

test('sectionId: prose-independent section ids, null for prose', () => {
  assert.equal(sectionId('8.9 Powerbox'), 'sec-8-9');
  assert.equal(sectionId('8.9 Renamed entirely'), 'sec-8-9'); // prose-independent
  assert.equal(sectionId('7A. Appendix'), 'sec-7a');
  assert.equal(sectionId('A.0 Branding'), 'sec-a-0');
  assert.equal(sectionId('3.2.1 Something'), 'sec-3-2-1');
  assert.equal(sectionId('Decisions & rejected alternatives'), null);
  assert.equal(sectionId('7A'), 'sec-7a');
  assert.notEqual(sectionId('7A'), sectionId('7')); // 7A ≠ 7
});

// ── remarkHeadingAnchors: sets hProperties.id + prepends anchor ───────────────
test('remarkHeadingAnchors: section id via hProperties + data-slug fallback', () => {
  const heading = {
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: '8.9 Powerbox' }],
  };
  const tree = { type: 'root', children: [heading] };
  remarkHeadingAnchors()(tree);
  assert.equal(heading.data.hProperties.id, 'sec-8-9');
  // data-slug is the GitHub text slug of the whole heading; textSlug drops the
  // non-word '.', so "8.9 Powerbox" → "89-powerbox".
  assert.equal(heading.data.hProperties['data-slug'], '89-powerbox');
  assert.equal(heading.children[0].type, 'mdxJsxTextElement');
  assert.equal(heading.children[0].name, 'HeadingAnchor');
});

test('remarkHeadingAnchors: sectionIds:false → plain text slug, no data-slug', () => {
  const heading = { type: 'heading', depth: 2, children: [{ type: 'text', value: '8.9 Powerbox' }] };
  const tree = { type: 'root', children: [heading] };
  remarkHeadingAnchors({ sectionIds: false })(tree);
  assert.equal(heading.data.hProperties.id, '89-powerbox');
  assert.equal(heading.data.hProperties['data-slug'], undefined);
});

// ── remarkWikiLinks: [[label|target]] → <WikiLink> ───────────────────────────
test('remarkWikiLinks: splits [[label|target]] into a WikiLink element', () => {
  const para = { type: 'paragraph', children: [{ type: 'text', value: 'see [[Docs|specs/x.mdx]] now' }] };
  const tree = { type: 'root', children: [para] };
  remarkWikiLinks()(tree);
  const wl = para.children.find((n) => n.name === 'WikiLink');
  assert.ok(wl, 'a WikiLink node is produced');
  assert.equal(wl.type, 'mdxJsxTextElement');
  assert.deepEqual(
    wl.attributes.map((a) => [a.name, a.value]),
    [['target', 'specs/x.mdx'], ['label', 'Docs']],
  );
});

// ── remarkAdmonitions: > [!NOTE] → <Admonition type="note"> ──────────────────
test('remarkAdmonitions: rewrites a GitHub alert blockquote', () => {
  const blockquote = {
    type: 'blockquote',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: '[!NOTE]\nbody' }] }],
  };
  const tree = { type: 'root', children: [blockquote] };
  remarkAdmonitions()(tree);
  const adm = tree.children[0];
  assert.equal(adm.type, 'mdxJsxFlowElement');
  assert.equal(adm.name, 'Admonition');
  assert.deepEqual(adm.attributes[0], { type: 'mdxJsxAttribute', name: 'type', value: 'note' });
});

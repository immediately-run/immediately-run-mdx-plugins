// R3-277 — the slug grammar's byte-parity fixture, asserted against the CANON here.
//
// This is the reference assertion the other consumers copy in shape but not in
// content: they import the same fixture from this package, so "all three agree"
// becomes a test each of them runs rather than a paragraph each of them read.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SLUG_PARITY_FIXTURE,
  headingId,
  sectionId,
  textSlug,
  remarkHeadingAnchors,
} from '../dist/index.js';

test('the fixture describes THIS package (the byte-canon)', () => {
  for (const c of SLUG_PARITY_FIXTURE) {
    assert.equal(textSlug(c.text), c.slug, `textSlug(${JSON.stringify(c.text)}) — ${c.why}`);
    assert.equal(sectionId(c.text), c.section, `sectionId(${JSON.stringify(c.text)}) — ${c.why}`);
    assert.equal(headingId(c.text), c.id, `headingId(${JSON.stringify(c.text)}) — ${c.why}`);
    assert.equal(
      headingId(c.text, { sectionIds: false }),
      c.idWithoutSections,
      `headingId(${JSON.stringify(c.text)}, {sectionIds:false}) — ${c.why}`,
    );
  }
});

test('the PLUGIN emits exactly those ids — the function and the transform cannot drift', () => {
  // A minimal mdast the plugin accepts: one heading per fixture case. The plugin is
  // where the id actually reaches a reader, so asserting only the exported function
  // would leave the interesting half unproven.
  for (const c of SLUG_PARITY_FIXTURE) {
    const tree = {
      type: 'root',
      children: [{ type: 'heading', depth: 2, children: [{ type: 'text', value: c.text }] }],
    };
    remarkHeadingAnchors()(tree);
    const heading = tree.children[0];
    assert.equal(heading.data.hProperties.id, c.id, `plugin id for ${JSON.stringify(c.text)}`);
    // The autolink anchor points at the heading's OWN id (§15.5).
    const anchor = heading.children[0];
    assert.equal(anchor.name, 'HeadingAnchor');
    assert.equal(anchor.attributes[0].value, c.id);
  }
});

test('the fixture is non-vacuous: it covers every branch of the grammar', () => {
  const has = (pred) => SLUG_PARITY_FIXTURE.some(pred);
  assert.ok(has((c) => c.section === null), 'a prose heading');
  assert.ok(has((c) => c.section && !c.section.includes('-', 4)), 'a whole-number section');
  assert.ok(has((c) => c.section && c.section.split('-').length > 2), 'a dotted section');
  assert.ok(has((c) => c.slug === ''), 'a heading that slugs to nothing');
  assert.ok(has((c) => c.id === 'section'), 'the empty-slug fallback');
  assert.ok(has((c) => c.id !== c.idWithoutSections), 'the sectionIds opt-out changing the id');
  // Non-ASCII by code point rather than a control-character range (which the lint
  // rule rightly flags — a literal \x00 in a regex is almost always a mistake).
  assert.ok(
    has((c) => [...c.text].some((ch) => ch.codePointAt(0) > 127)),
    'a non-ASCII heading',
  );
  assert.ok(has((c) => c.slug.includes('_')), 'an underscore surviving');
  // Two different texts with the SAME section id — prose-independence, the property
  // the whole citation scheme rests on.
  const sections = SLUG_PARITY_FIXTURE.filter((c) => c.section).map((c) => c.section);
  assert.ok(sections.length !== new Set(sections).size, 'two texts sharing one section id');
});

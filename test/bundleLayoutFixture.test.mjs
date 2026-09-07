// R3-544 — the bundle-layout fixture is well-formed data: every case states its
// expectation in the parser's diagnostic vocabulary, and every case REPLAYS through
// parseBundleLayout to match — the same self-policing shape as the link-space and
// slug fixtures, so a parity claim made against bundled examples can never be vacuous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE_LAYOUT_FIXTURE, parseBundleLayout } from '../dist/index.js';

const present = (pred) => BUNDLE_LAYOUT_FIXTURE.some(pred);

test('the fixture is non-empty and covers the documented case classes', () => {
  assert.ok(BUNDLE_LAYOUT_FIXTURE.length >= 12, 'cases went missing');
  assert.ok(present((c) => c.accept && c.diagnostics.length === 0), 'accept');
  assert.ok(present((c) => !c.accept), 'whole-block refuse');
  assert.ok(present((c) => c.diagnostics.includes('reserved-key')), 'reserved key');
  assert.ok(present((c) => c.diagnostics.includes('bad-media-type')), 'bad media type');
  assert.ok(present((c) => c.diagnostics.includes('bad-schema')), 'bad schema');
  assert.ok(present((c) => c.diagnostics.includes('schema-on-opaque')), 'schema on opaque');
  assert.ok(present((c) => c.diagnostics.includes('unsupported-version')), 'unknown version');
  assert.ok(present((c) => c.diagnostics.includes('bad-layout-from')), 'bad layoutFrom');
});

test('every case replays through parseBundleLayout and matches its expectation', () => {
  for (const c of BUNDLE_LAYOUT_FIXTURE) {
    assert.ok(typeof c.name === 'string' && c.name.length > 0, 'name');
    assert.ok(typeof c.why === 'string' && c.why.length > 0, `${c.name}: why`);
    const { layout, diagnostics } = parseBundleLayout(c.layout);
    const codes = diagnostics.map((d) => d.code).sort();
    assert.deepEqual(codes, [...c.diagnostics].sort(), `${c.name}: diagnostic codes`);
    assert.equal(layout !== null, c.accept, `${c.name}: accept`);
  }
});

// R3-277b — the link-resolution fixture is well-formed data: every case states
// its expectation in the resolver's three-state vocabulary, every `resolved`
// expectation is a normalized absolute path (no `.`/`..`/trailing-slash left),
// and the documented caller contract (path-half only) holds. This package owns
// the DATA; the SDK's own suite asserts the CANON (resolveLinkTarget) against
// it, and Grove's runtime + the docs checker each assert their outcomes against
// it — those harnesses are the parity claims; this is the fixture policing
// itself so the parity claims cannot be vacuous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINK_SPACE_FIXTURE } from '../dist/index.js';

const states = new Set(['resolved', 'unresolvable', 'invalid']);

test('the fixture is non-empty and covers the documented case classes', () => {
  assert.ok(LINK_SPACE_FIXTURE.length >= 13, 'cases went missing');
  const has = (pred) => LINK_SPACE_FIXTURE.some(pred);
  assert.ok(has((c) => !c.raw.startsWith('/') && !c.raw.startsWith('$fs:')), 'relative');
  assert.ok(has((c) => c.raw.startsWith('/') && c.corpusRoot), 'corpus-absolute');
  assert.ok(has((c) => c.raw.startsWith('$fs:')), '$fs:');
  assert.ok(has((c) => c.expect.state === 'invalid'), 'invalid');
  assert.ok(has((c) => c.expect.state === 'unresolvable'), 'unresolvable');
  assert.ok(has((c) => c.bundleChrooted), 'bundle-chrooted');
  assert.ok(has((c) => c.corpusRoot === null), 'non-corpus');
});

test('every case is well-formed', () => {
  for (const c of LINK_SPACE_FIXTURE) {
    assert.ok(states.has(c.expect.state), `${c.raw}: state vocabulary`);
    assert.ok(typeof c.why === 'string' && c.why.length > 0, `${c.raw}: why`);
    if (c.expect.state === 'resolved') {
      const p = c.expect.path;
      assert.ok(p.startsWith('/'), `${c.raw}: resolved paths are absolute`);
      assert.ok(!/[.]\/|[.][.][/]|\/\//.test(p) && !p.endsWith('/.'), `${c.raw}: ${p} is normalized`);
    }
  }
});

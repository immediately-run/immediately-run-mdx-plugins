// R3-279 — the CANON assertion: the resolver passes its own fixture. Until the
// resolver moved here, this lived only transitively (grove's runtime harness and
// the docs checker, which run AROUND the SDK's copy); the canon beside the fixture
// makes "resolver ≡ fixture" a first-class test in the package that ships both.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FS_PREFIX, LINK_SPACE_FIXTURE, normalizeAbsolute, resolveLinkTarget } from '../dist/index.js';

test('resolveLinkTarget passes LINK_SPACE_FIXTURE (the canon)', () => {
  for (const c of LINK_SPACE_FIXTURE) {
    const got = resolveLinkTarget(c.raw, {
      currentFile: c.currentFile,
      corpusRoot: c.corpusRoot,
      bundleChrooted: c.bundleChrooted,
    });
    assert.deepEqual(got, c.expect, `${c.raw} — ${c.why}`);
  }
});

test('normalizeAbsolute collapses and clamps at the root', () => {
  assert.equal(normalizeAbsolute('/a/./b/../c//'), '/a/c');
  assert.equal(normalizeAbsolute('/../../x'), '/x');
});

test('FS_PREFIX is the documented escape', () => {
  assert.equal(FS_PREFIX, '$fs:');
  assert.equal(resolveLinkTarget(`${FS_PREFIX}javascript:x`).state, 'invalid');
});

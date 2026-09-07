// R3-544 — the bundle layout grammar: parseBundleLayout + pruneLayoutToView over
// the REAL producer (BUNDLE_EMBEDDING_SPEC §4a.1, copied verbatim), each §4a.5
// bound exceeded by one, the reserved-key namespaces, schema/mediaType refusals, and
// the subtree prune.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBundleLayout, pruneLayoutToView, LAYOUT_LIMITS } from '../dist/index.js';

// The `layout` value of `docs/content/immediately.run.json` as R3-545 will commit
// it — copied VERBATIM from BUNDLE_EMBEDDING_SPEC §4a.1 (not typed by taste, so the
// real grammar is the input).
const WIKI_LAYOUT = () => ({
  version: 1,
  recordSets: {
    'roadmap-items': {
      dir: '/roadmap',
      select: 'R3-*.mdx',
      record: 'mdx-frontmatter',
      schema: '/roadmap/item.schema.json',
      id: { from: 'filename' },
      unique: ['roadmap-archive'],
      wellKnown: {
        title: 'frontmatter.title',
        status: {
          from: 'frontmatter.status',
          values: ['available', 'in-progress', 'in-review', 'deferred', 'deprioritized', 'superseded'],
          terminal: { value: 'done', movesTo: 'roadmap-archive' },
        },
        order: { from: 'frontmatter.order', meaning: 'execution' },
        body: 'content',
      },
      writable: [],
    },
    'roadmap-archive': {
      dir: '/roadmap/archive',
      select: 'R3-*.mdx',
      record: 'mdx-frontmatter',
      schema: '/roadmap/item.schema.json',
      id: { from: 'filename' },
      frozen: true,
    },
    figures: {
      dir: '/specs/figures',
      select: '*.png',
      mediaType: 'image/png',
      id: { from: 'filename' },
    },
  },
  tree: {
    '/roadmap': { purpose: 'the live engineering roadmap, one file per work item' },
    '/roadmap/archive': { purpose: 'done items, moved here by the owner\u2019s tooling' },
    '/roadmap/board': { purpose: 'the kanban view of /roadmap', bundle: true },
    '/specs': { purpose: 'one spec per area' },
    '/context': { purpose: 'the resident context set and the routed documents' },
  },
});

test('(a) the real §4a.1 block parses with zero diagnostics and round-trips', () => {
  const input = WIKI_LAYOUT();
  const { layout, diagnostics } = parseBundleLayout(input);
  assert.deepEqual(diagnostics, []);
  assert.ok(layout, 'layout is non-null');
  assert.equal(layout.version, 1);

  assert.deepEqual(Object.keys(layout.recordSets).sort(), ['figures', 'roadmap-archive', 'roadmap-items']);
  const items = layout.recordSets['roadmap-items'];
  assert.equal(items.schema, '/roadmap/item.schema.json');
  assert.equal(items.wellKnown.status.from, 'frontmatter.status');
  assert.deepEqual(items.wellKnown.status.terminal, { value: 'done', movesTo: 'roadmap-archive' });
  assert.equal(items.wellKnown.order.meaning, 'execution');
  assert.deepEqual(items.unique, ['roadmap-archive']);
  // mediaType-only ⇒ opaque by definition
  assert.equal(layout.recordSets.figures.record, 'opaque');
  assert.equal(layout.recordSets.figures.mediaType, 'image/png');
  assert.equal(layout.tree['/roadmap/board'].bundle, true);

  // round-trip: the canonical serialization re-parses identically.
  const again = parseBundleLayout(JSON.parse(JSON.stringify(layout)));
  assert.deepEqual(again.diagnostics, []);
  assert.deepEqual(Object.keys(again.layout.recordSets).sort(), Object.keys(layout.recordSets).sort());
});

test('(b) each §4a.5 bound, exceeded by one, yields exactly its diagnostic and layout:null', () => {
  const expectLimit = (layout, code) => {
    const { layout: out, diagnostics } = parseBundleLayout(layout);
    assert.equal(out, null, `${code}: layout is null`);
    assert.deepEqual(diagnostics.map((d) => d.code), [code]);
  };

  const recordSets = {};
  for (let i = 0; i < LAYOUT_LIMITS.recordSets + 1; i++) recordSets[`set${i}`] = { dir: `/d${i}`, record: 'opaque' };
  expectLimit({ version: 1, recordSets }, 'limit-record-sets');

  const tree = {};
  for (let i = 0; i < LAYOUT_LIMITS.treeEntries + 1; i++) tree[`/t${i}`] = { purpose: 'x' };
  expectLimit({ version: 1, recordSets: {}, tree }, 'limit-tree-entries');

  expectLimit(
    { version: 1, recordSets: { a: { dir: '/a', select: 'x'.repeat(LAYOUT_LIMITS.selectGlobLength + 1), record: 'opaque' } } },
    'limit-select-glob',
  );

  expectLimit(
    {
      version: 1,
      recordSets: {
        a: { dir: '/a', record: 'opaque', unique: Array.from({ length: LAYOUT_LIMITS.uniqueFanOut + 1 }, (_, i) => `s${i}`) },
      },
    },
    'limit-unique',
  );

  const wellKnown = {};
  for (let i = 0; i < LAYOUT_LIMITS.wellKnownNames + 1; i++) wellKnown[`k${i}`] = 'frontmatter.title';
  expectLimit(
    { version: 1, recordSets: { a: { dir: '/a', record: 'mdx-frontmatter', wellKnown } } },
    'limit-well-known',
  );
});

test('(c) __proto__ as record-set name, wellKnown key, and from segment each refuse', () => {
  const byName = JSON.parse(
    '{"version":1,"recordSets":{"__proto__":{"dir":"/x","record":"opaque"},"ok":{"dir":"/y","record":"opaque"}}}',
  );
  let r = parseBundleLayout(byName);
  assert.ok(r.layout, 'record-set name: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), ['ok']);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);

  const byKnown = JSON.parse(
    '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","record":"mdx-frontmatter","wellKnown":{"__proto__":"frontmatter.title"}}}}',
  );
  r = parseBundleLayout(byKnown);
  assert.ok(r.layout, 'wellKnown key: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), []);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);

  const byFrom = JSON.parse(
    '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","record":"mdx-frontmatter","id":{"from":"frontmatter.__proto__"}}}}',
  );
  r = parseBundleLayout(byFrom);
  assert.ok(r.layout, 'from segment: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), []);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);
});

test('(d) a $fs: schema path is refused', () => {
  const r = parseBundleLayout({
    version: 1,
    recordSets: { roadmap: { dir: '/roadmap', record: 'mdx-frontmatter', schema: '$fs:/x.json' } },
  });
  assert.ok(r.layout);
  assert.deepEqual(Object.keys(r.layout.recordSets), []);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['bad-schema']);
});

test('(e) mediaType: parameters/uppercase refuse, single and list accept', () => {
  const bad = parseBundleLayout({
    version: 1,
    recordSets: { figures: { dir: '/figures', select: '*.png', mediaType: 'Image/PNG; q=1' } },
  });
  assert.deepEqual(bad.diagnostics.map((d) => d.code), ['bad-media-type']);
  assert.deepEqual(Object.keys(bad.layout.recordSets), []);

  const single = parseBundleLayout({
    version: 1,
    recordSets: { figures: { dir: '/figures', select: '*.png', mediaType: 'image/png' } },
  });
  assert.deepEqual(single.diagnostics, []);
  assert.equal(single.layout.recordSets.figures.mediaType, 'image/png');
  assert.equal(single.layout.recordSets.figures.record, 'opaque');

  const list = parseBundleLayout({
    version: 1,
    recordSets: { figures: { dir: '/figures', select: '*.png', mediaType: ['image/png', 'image/jpeg'] } },
  });
  assert.deepEqual(list.diagnostics, []);
  assert.deepEqual(list.layout.recordSets.figures.mediaType, ['image/png', 'image/jpeg']);
});

test('(f) pruneLayoutToView("/roadmap") drops figures + out-of-view tree, keeps both roadmap sets and unique', () => {
  const { layout } = parseBundleLayout(WIKI_LAYOUT());
  const pruned = pruneLayoutToView(layout, '/roadmap');

  assert.deepEqual(Object.keys(pruned.recordSets).sort(), ['roadmap-archive', 'roadmap-items']);
  assert.deepEqual(Object.keys(pruned.tree).sort(), ['/roadmap', '/roadmap/archive', '/roadmap/board']);
  assert.deepEqual(pruned.recordSets['roadmap-items'].unique, ['roadmap-archive']);

  // The input is not mutated.
  assert.deepEqual(Object.keys(layout.recordSets).sort(), ['figures', 'roadmap-archive', 'roadmap-items']);
});

test('(f2) a unique reference to a pruned-out set is dropped', () => {
  const { layout } = parseBundleLayout({
    version: 1,
    recordSets: {
      live: { dir: '/roadmap', record: 'mdx-frontmatter', unique: ['archive', 'figures'] },
      archive: { dir: '/roadmap/archive', record: 'mdx-frontmatter' },
      figures: { dir: '/specs/figures', record: 'opaque', mediaType: 'image/png' },
    },
  });
  const pruned = pruneLayoutToView(layout, '/roadmap');
  assert.deepEqual(pruned.recordSets.live.unique, ['archive']);
});

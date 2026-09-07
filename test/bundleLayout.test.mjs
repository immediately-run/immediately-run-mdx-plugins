// R3-544 — the bundle layout grammar: parseBundleLayout + pruneLayoutToView over
// the REAL producer (BUNDLE_EMBEDDING_SPEC §4a.1 — the fixture's first case, read
// from BUNDLE_LAYOUT_FIXTURE so the block has exactly one home), the reserved-key
// namespaces, schema/mediaType refusals, and the subtree prune. Each §4a.5 bound
// is a bundleLayoutFixture case (and asserted here directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE_LAYOUT_FIXTURE, parseBundleLayout, pruneLayoutToView } from '../dist/index.js';

const WIKI_LAYOUT = BUNDLE_LAYOUT_FIXTURE.find((c) => c.name === 'wiki layout (§4a.1)').layout;

test('(a) the real §4a.1 block parses with zero diagnostics and round-trips', () => {
  const { layout, diagnostics } = parseBundleLayout(WIKI_LAYOUT);
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
  assert.deepEqual(again.layout, layout);
});

test('(b) each §4a.5 bound, exceeded by one, yields exactly its diagnostic and layout:null', () => {
  const limitCodes = ['limit-record-sets', 'limit-tree-entries', 'limit-select-glob', 'limit-unique', 'limit-well-known'];
  const cases = BUNDLE_LAYOUT_FIXTURE.filter((c) => c.diagnostics.some((d) => limitCodes.includes(d)));
  assert.equal(cases.length, 5, 'all five bounds are fixture cases');
  for (const c of cases) {
    const { layout, diagnostics } = parseBundleLayout(c.layout);
    assert.equal(layout, null, `${c.name}: layout is null`);
    assert.deepEqual(diagnostics.map((d) => d.code), c.diagnostics, `${c.name}: diagnostic`);
  }
});

test('(c) __proto__ as record-set name, wellKnown key, and from segment each refuse', () => {
  const byName = BUNDLE_LAYOUT_FIXTURE.find((c) => c.name === 'reserved record-set name is dropped, the rest survive').layout;
  let r = parseBundleLayout(byName);
  assert.ok(r.layout, 'record-set name: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), ['ok']);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);

  const byKnown = BUNDLE_LAYOUT_FIXTURE.find((c) => c.name === 'reserved wellKnown name refuses').layout;
  r = parseBundleLayout(byKnown);
  assert.ok(r.layout, 'wellKnown key: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), []);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);

  const byFrom = BUNDLE_LAYOUT_FIXTURE.find((c) => c.name === 'reserved `from` segment refuses').layout;
  r = parseBundleLayout(byFrom);
  assert.ok(r.layout, 'from segment: layout survives');
  assert.deepEqual(Object.keys(r.layout.recordSets), []);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['reserved-key']);
});

test('(d) a $fs: schema path is refused', () => {
  const r = parseBundleLayout({
    version: 1,
    recordSets: { roadmap: { dir: '/roadmap', select: 'R3-*.mdx', record: 'mdx-frontmatter', schema: '$fs:/x.json' } },
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
  const { layout } = parseBundleLayout(WIKI_LAYOUT);
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
      live: { dir: '/roadmap', select: '*.mdx', record: 'mdx-frontmatter', unique: ['archive', 'figures'] },
      archive: { dir: '/roadmap/archive', select: '*.mdx', record: 'mdx-frontmatter' },
      figures: { dir: '/specs/figures', select: '*.png', mediaType: 'image/png' },
    },
  });
  const pruned = pruneLayoutToView(layout, '/roadmap');
  assert.deepEqual(pruned.recordSets.live.unique, ['archive']);
});

test('(f3) a root view keeps everything, and an all-pruned unique omits the key', () => {
  const { layout } = parseBundleLayout({
    version: 1,
    recordSets: {
      live: { dir: '/roadmap', select: '*.mdx', record: 'mdx-frontmatter', unique: ['figures'] },
      figures: { dir: '/specs/figures', select: '*.png', mediaType: 'image/png' },
    },
    tree: { '/roadmap': { purpose: 'x' } },
  });

  // root view: nothing is dropped.
  const root = pruneLayoutToView(layout, '/');
  assert.deepEqual(Object.keys(root.recordSets).sort(), ['figures', 'live']);
  assert.deepEqual(Object.keys(root.tree), ['/roadmap']);

  // an all-pruned unique leaves no `unique` key.
  const scoped = pruneLayoutToView(layout, '/roadmap');
  assert.ok(!('unique' in scoped.recordSets.live), 'unique key is omitted when every reference is pruned out');
});

test('(g) the parser never aliases the input objects', () => {
  const input = {
    version: 1,
    recordSets: {
      roadmap: {
        dir: '/roadmap',
        select: 'R3-*.mdx',
        record: 'mdx-frontmatter',
        mediaType: ['application/json', 'text/md'],
        wellKnown: { status: { from: 'frontmatter.status', values: ['a', 'b'] } },
      },
    },
  };
  const { layout } = parseBundleLayout(input);
  const src = input.recordSets.roadmap;
  const out = layout.recordSets.roadmap;
  assert.ok(out.mediaType !== src.mediaType, 'mediaType list is copied, not aliased');
  assert.ok(out.wellKnown.status.values !== src.wellKnown.status.values, 'status.values is copied, not aliased');
  out.mediaType.push('nope');
  out.wellKnown.status.values.push('nope');
  assert.deepEqual(src.mediaType, ['application/json', 'text/md']);
  assert.deepEqual(src.wellKnown.status.values, ['a', 'b']);
});

test('(h) a trailing slash on a dir/tree path is tolerated and normalized', () => {
  const r = parseBundleLayout({
    version: 1,
    recordSets: { roadmap: { dir: '/roadmap/', select: 'R3-*.mdx', record: 'opaque', mediaType: 'text/md' } },
    tree: { '/roadmap/': { purpose: 'x' } },
  });
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.layout.recordSets.roadmap.dir, '/roadmap');
  assert.equal(r.layout.tree['/roadmap'].purpose, 'x');
});

test('(i) prune keeps never-declared unique references for the checker and layoutFrom only at the root', () => {
  const parsed = parseBundleLayout({
    version: 1,
    recordSets: {
      live: { dir: '/roadmap', select: '*.mdx', record: 'mdx-frontmatter', unique: ['typo-archive'] },
    },
  });
  const scoped = pruneLayoutToView(parsed.layout, '/roadmap');
  assert.deepEqual(scoped.recordSets.live.unique, ['typo-archive'], 'a never-declared unique reference is the checker\u2019s finding, not the prune\u2019s');

  const withFrom = parseBundleLayout({ version: 1, layoutFrom: { app: 'github:immediately-run/grove', commit: '0123abc' } }).layout;
  assert.ok(pruneLayoutToView(withFrom, '/').layoutFrom, 'layoutFrom survives the root view');
  assert.ok(!pruneLayoutToView(withFrom, '/roadmap').layoutFrom, 'layoutFrom is dropped from a proper subtree');
});

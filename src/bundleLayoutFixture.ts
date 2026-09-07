// The parity fixture for the BUNDLE LAYOUT grammar (BUNDLE_EMBEDDING_SPEC §4a,
// R3-544) — the same role SLUG_PARITY_FIXTURE plays for the slug grammar and
// LINK_SPACE_FIXTURE for link resolution: one set of accept/clamp/refuse cases
// every consumer replays, so a disagreement is a failing test in whichever repo
// drifted rather than a silent second grammar.
//
// CONSUMERS: the host's marker reader (`contentMarker.test.ts`, which maps the
// parser's diagnostics onto its `MarkerRejection` vocabulary) and the docs
// checker's self-test. They import THIS data and assert their own parse outcome
// equals each case's expectation.
//
// CALLER CONTRACT: `layout` is the VALUE of the marker's `layout` key (the block,
// not the whole `immediately.run.json`). `accept` says whether `parseBundleLayout`
// returned a non-null layout; `diagnostics` is the EXACT set of diagnostic codes.
// The reserved-key cases build their input with `JSON.parse` so the `__proto__`
// name is a genuine own property (a TS object literal would set the prototype
// instead). Every §4a.5 `limit-*` bound is a case, built at load time from
// LAYOUT_LIMITS so the fixture and the parser can never disagree on the number.
import { LAYOUT_LIMITS } from './bundleLayout';
import type { LayoutDiagnosticCode } from './bundleLayout';

/** One layout block and the parse every consumer must agree on. */
export interface BundleLayoutCase {
  name: string;
  /** The `layout` block value as parsed from the marker. */
  layout: unknown;
  /** `true` when `parseBundleLayout` returns a non-null layout. */
  accept: boolean;
  /** The EXACT set of diagnostic codes (order-insensitive). */
  diagnostics: LayoutDiagnosticCode[];
  why: string;
}

// The real producer — the `layout` value of `docs/content/immediately.run.json` as
// it will be committed by R3-545, copied verbatim from BUNDLE_EMBEDDING_SPEC §4a.1
// (ASCII only, byte-for-byte: the "owner's tooling" apostrophe is 0x27).
const wikiLayout = {
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
    '/roadmap/archive': { purpose: "done items, moved here by the owner's tooling" },
    '/roadmap/board': { purpose: 'the kanban view of /roadmap', bundle: true },
    '/specs': { purpose: 'one spec per area' },
    '/context': { purpose: 'the resident context set and the routed documents' },
  },
} as const;

const limits = LAYOUT_LIMITS;

// The per-record-set bounds, exceeded by one, built from LAYOUT_LIMITS so they stay
// exact if the numbers move. Each must yield ONLY its `limit-*` diagnostic.
const limitCases = (): BundleLayoutCase[] => {
  const recordSets: Record<string, unknown> = {};
  for (let i = 0; i < limits.recordSets + 1; i++) recordSets[`set${i}`] = { dir: `/d${i}`, select: '*', record: 'opaque' };
  const tree: Record<string, unknown> = {};
  for (let i = 0; i < limits.treeEntries + 1; i++) tree[`/t${i}`] = { purpose: 'x' };
  const unique = Array.from({ length: limits.uniqueFanOut + 1 }, (_, i) => `s${i}`);
  const wellKnown: Record<string, unknown> = {};
  for (let i = 0; i < limits.wellKnownNames + 1; i++) wellKnown[`k${i}`] = 'frontmatter.title';

  return [
    {
      name: 'limit: record sets',
      layout: { version: 1, recordSets },
      accept: false,
      diagnostics: ['limit-record-sets'],
      why: '§4a.5 — more record sets than the bound refuses the whole block',
    },
    {
      name: 'limit: tree entries',
      layout: { version: 1, recordSets: {}, tree },
      accept: false,
      diagnostics: ['limit-tree-entries'],
      why: '§4a.5 — more tree entries than the bound refuses the whole block',
    },
    {
      name: 'limit: select glob length',
      layout: {
        version: 1,
        recordSets: { a: { dir: '/a', select: 'x'.repeat(limits.selectGlobLength + 1), record: 'opaque' } },
      },
      accept: false,
      diagnostics: ['limit-select-glob'],
      why: '§4a.5 — a select glob longer than the bound refuses the whole block',
    },
    {
      name: 'limit: unique fan-out',
      layout: { version: 1, recordSets: { a: { dir: '/a', select: '*', record: 'opaque', unique } } },
      accept: false,
      diagnostics: ['limit-unique'],
      why: '§4a.5 — more unique references than the bound refuses the whole block',
    },
    {
      name: 'limit: wellKnown names',
      layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', wellKnown } } },
      accept: false,
      diagnostics: ['limit-well-known'],
      why: '§4a.5 — more wellKnown fields than the bound refuses the whole block',
    },
  ];
};

export const BUNDLE_LAYOUT_FIXTURE: readonly BundleLayoutCase[] = [
  {
    name: 'wiki layout (§4a.1)',
    layout: wikiLayout,
    accept: true,
    diagnostics: [],
    why: 'the real producer — the wiki\u2019s own declaration parses with no diagnostics',
  },
  {
    name: 'mediaType list accepted; schema+structured record accepted',
    layout: {
      version: 1,
      recordSets: {
        figures: { dir: '/figures', select: '*.{png,jpg}', mediaType: ['image/png', 'image/jpeg'] },
        manifests: { dir: '/m', select: '*.json', record: 'json-file', mediaType: 'application/json', schema: '/m/x.schema.json' },
      },
    },
    accept: true,
    diagnostics: [],
    why: 'a list of media types, and mediaType beside a structured record (permitted and redundant), both accept',
  },
  {
    name: 'layoutFrom adopts an owner-pinned default',
    layout: { version: 1, layoutFrom: { app: 'github:immediately-run/grove', commit: '0123abc' } },
    accept: true,
    diagnostics: [],
    why: 'the §4a.1 alternative — a provider default instead of an own recordSets/tree block',
  },
  {
    name: 'unknown version degrades to "no layout"',
    layout: { version: 2, recordSets: {} },
    accept: false,
    diagnostics: ['unsupported-version'],
    why: '§4a.5 — a grammar the parser does not know is refused whole, the bundle still opens',
  },
  {
    name: 'not an object',
    layout: 'layout',
    accept: false,
    diagnostics: ['layout-not-object'],
    why: 'a non-object layout is malformed',
  },
  {
    name: 'neither recordSets nor layoutFrom',
    layout: { version: 1 },
    accept: false,
    diagnostics: ['missing-record-sets'],
    why: 'a layout that declares nothing is malformed',
  },
  {
    name: 'recordSets not an object',
    layout: { version: 1, recordSets: 'roadmap' },
    accept: false,
    diagnostics: ['record-sets-not-object'],
    why: 'recordSets must be an object',
  },
  {
    name: 'layoutFrom and recordSets are mutually exclusive',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*', record: 'opaque' } }, layoutFrom: { app: 'github:immediately-run/grove', commit: '0123abc' } },
    accept: true,
    diagnostics: ['layout-from-conflict'],
    why: '§4a.1 — layoutFrom is "instead of" an own block; a recordSets wins and layoutFrom is dropped',
  },
  {
    name: 'layoutFrom and tree are mutually exclusive',
    layout: { version: 1, tree: { '/roadmap': { purpose: 'x' } }, layoutFrom: { app: 'github:immediately-run/grove', commit: '0123abc' } },
    accept: true,
    diagnostics: ['layout-from-conflict'],
    why: '§4a.1 — layoutFrom is "instead of" an own recordSets/tree block; a tree alone triggers the same conflict',
  },
  {
    name: 'a trailing slash on a dir is a clamp, not a refusal',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap/', select: 'R3-*.mdx', record: 'opaque', mediaType: 'text/md' } }, tree: { '/roadmap/': { purpose: 'x' } } },
    accept: true,
    diagnostics: [],
    why: 'dir/tree tolerate one trailing slash (the spec §3 `at: \'/items/\'` spelling) and normalize it away — the one accept-and-normalize clamp in the grammar',
  },
  {
    name: 'layoutFrom with a revision refused',
    layout: { version: 1, layoutFrom: { app: 'github:immediately-run/grove@main', commit: '0123abc' } },
    accept: true,
    diagnostics: ['bad-layout-from'],
    why: 'layoutFrom.app is a revision-less identity; the revision lives in commit (§4a.1)',
  },
  {
    name: 'reserved record-set name is dropped, the rest survive',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"__proto__":{"dir":"/x","select":"*","record":"opaque"},"ok":{"dir":"/y","select":"*","record":"opaque"}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: '§4a.5 key hygiene — `__proto__` as a record-set name refuses that set, the block still parses',
  },
  {
    name: 'reserved wellKnown name refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"__proto__":"frontmatter.title"}}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: 'a `__proto__` wellKnown key is refused',
  },
  {
    name: 'reserved `from` segment refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","id":{"from":"frontmatter.__proto__"}}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: 'a `from` path whose segment is `__proto__` is refused',
  },
  {
    name: 'reserved record-set name `constructor` refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"constructor":{"dir":"/x","select":"*","record":"opaque","mediaType":"image/png"},"ok":{"dir":"/y","select":"*","record":"opaque","mediaType":"image/png"}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: '§4a.5 — `constructor` in the record-set namespace is refused (the whole RESERVED_KEYS class, not only __proto__)',
  },
  {
    name: 'reserved record-set name `prototype` refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"prototype":{"dir":"/x","select":"*","record":"opaque","mediaType":"image/png"}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: '§4a.5 — `prototype` in the record-set namespace is refused',
  },
  {
    name: 'the full closed wellKnown vocabulary accepts',
    layout: {
      version: 1,
      recordSets: {
        docs: {
          dir: '/docs',
          select: '*.mdx',
          record: 'mdx-frontmatter',
          schema: '/docs/doc.schema.json',
          wellKnown: {
            title: 'frontmatter.title',
            body: 'content',
            status: { from: 'frontmatter.status', values: ['draft', 'published'] },
            order: { from: 'frontmatter.order', meaning: 'display' },
            labels: 'frontmatter.tags',
            date: 'frontmatter.date',
            summary: 'frontmatter.summary',
          },
        },
      },
    },
    accept: true,
    diagnostics: [],
    why: '§4a.1 — every one of the seven well-known names parses (labels/date/summary are input here, not just favourites)',
  },
  {
    name: 'schema $fs: refused',
    layout: {
      version: 1,
      recordSets: { roadmap: { dir: '/roadmap', select: 'R3-*.mdx', record: 'mdx-frontmatter', schema: '$fs:/x.json' } },
    },
    accept: true,
    diagnostics: ['bad-schema'],
    why: '§4a.1 — a schema MUST be bundle-intrinsic; `$fs:` is refused here',
  },
  {
    name: 'schema on a mediaType-only (opaque) record set refused',
    layout: {
      version: 1,
      recordSets: { figures: { dir: '/figures', select: '*.png', mediaType: 'image/png', schema: '/f.schema.json' } },
    },
    accept: true,
    diagnostics: ['schema-on-opaque'],
    why: 'schema on an opaque record set is a refusal diagnostic (§4a.1)',
  },
  {
    name: 'bad mediaType refused (uppercase + parameters)',
    layout: { version: 1, recordSets: { figures: { dir: '/figures', select: '*.png', mediaType: 'Image/PNG; q=1' } } },
    accept: true,
    diagnostics: ['bad-media-type'],
    why: '§4a.1 — lowercase RFC 6838 token pair only, no parameters, no registry lookup',
  },
  {
    name: 'bad directory refused (traversal)',
    layout: { version: 1, recordSets: { roadmap: { dir: '/../escape', select: '*', record: 'opaque' } } },
    accept: true,
    diagnostics: ['bad-dir'],
    why: 'a `dir` with `..` is refused, not clamped — a layout is a description',
  },
  {
    name: 'bad select refused (separator)',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', select: '../*.mdx', record: 'mdx-frontmatter' } } },
    accept: true,
    diagnostics: ['bad-select'],
    why: 'select is a non-recursive basename glob — separators and `..` are refused',
  },
  {
    name: 'bad record grammar refused',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', select: 'R3-*.mdx', record: 'yaml' } } },
    accept: true,
    diagnostics: ['bad-record'],
    why: 'record must be one of the closed set',
  },
  {
    name: 'a wellKnown name outside the closed vocabulary is refused',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"banana":"frontmatter.title"}}}}',
    ),
    accept: true,
    diagnostics: ['bad-well-known'],
    why: '§4a.1 — wellKnown is a closed vocabulary; an unknown name is refused',
  },
  {
    name: 'wellKnown structure on the wrong field is refused',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"title":{"from":"frontmatter.title","values":["a"]}}}}}',
    ),
    accept: true,
    diagnostics: ['bad-well-known'],
    why: '`values`/`terminal` belong to status only, `meaning` to order only',
  },
  {
    name: 'an opaque record set may only name filename/mtime/size in wellKnown',
    layout: {
      version: 1,
      recordSets: {
        figures: { dir: '/figures', select: '*.png', mediaType: 'image/png', wellKnown: { title: 'frontmatter.title' } },
      },
    },
    accept: true,
    diagnostics: ['bad-well-known'],
    why: '§4a.1 — there is no record to read on an opaque set, so the source is filename/mtime/size',
  },
  {
    name: 'missing select refused',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', record: 'mdx-frontmatter' } } },
    accept: true,
    diagnostics: ['missing-select'],
    why: '§4a.1 — a record set is a directory plus a select glob',
  },
  {
    name: 'missing record grammar (record/mediaType) refused',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', select: 'R3-*.mdx' } } },
    accept: true,
    diagnostics: ['missing-record'],
    why: '§4a.1 — a record set must declare record or mediaType; neither means the block does not say what a record is',
  },
  {
    name: 'a schema alone names no grammar',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', select: 'R3-*.mdx', schema: '/roadmap/item.schema.json' } } },
    accept: true,
    diagnostics: ['missing-record'],
    why: 'a schema with no record grammar is refused — the consumer could not choose mdx-frontmatter vs json-file',
  },
  {
    name: 'record set value not an object',
    layout: { version: 1, recordSets: { a: 42 } },
    accept: true,
    diagnostics: ['bad-record-set'],
    why: 'a record set entry must be an object',
  },
  {
    name: 'bad recursive refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', recursive: 'yes' } } },
    accept: true,
    diagnostics: ['bad-recursive'],
    why: 'recursive must be a boolean',
  },
  {
    name: 'bad id refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', id: { from: 42 } } } },
    accept: true,
    diagnostics: ['bad-id'],
    why: 'id.from must be a safe `from` path',
  },
  {
    name: 'bad unique refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', unique: 'roadmap-archive' } } },
    accept: true,
    diagnostics: ['bad-unique'],
    why: 'unique must be an array of safe record-set names',
  },
  {
    name: 'bad wellKnown (not an object) refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', wellKnown: 'title' } } },
    accept: true,
    diagnostics: ['bad-well-known'],
    why: 'wellKnown must be an object',
  },
  {
    name: 'bad writable refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', writable: 'status' } } },
    accept: true,
    diagnostics: ['bad-writable'],
    why: 'writable must be an array of strings',
  },
  {
    name: 'bad frozen refused',
    layout: { version: 1, recordSets: { a: { dir: '/a', select: '*.mdx', record: 'mdx-frontmatter', frozen: 'yes' } } },
    accept: true,
    diagnostics: ['bad-frozen'],
    why: 'frozen must be a boolean',
  },
  {
    name: 'tree not an object',
    layout: { version: 1, recordSets: {}, tree: 'roadmap' },
    accept: true,
    diagnostics: ['bad-tree'],
    why: 'tree must be an object',
  },
  {
    name: 'bad tree entry refused',
    layout: { version: 1, recordSets: {}, tree: { '/roadmap': 'purpose' } },
    accept: true,
    diagnostics: ['bad-tree-entry'],
    why: 'each tree entry must be an object',
  },
  ...limitCases(),
];

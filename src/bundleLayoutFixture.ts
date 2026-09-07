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
// not the whole `immediately.run.json`). `expect.diagnostics` is the EXACT set of
// diagnostic codes a parse must produce; `accept` says whether `layout` came back
// non-null. The reserved-key cases build their input with `JSON.parse` so the
// `__proto__` name is a genuine own property (a TS object literal would set the
// prototype instead — the annotation everyone who edits this file needs).
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

// The real producer — `.layout` value of `docs/content/immediately.run.json` as it
// will be committed by R3-545, copied verbatim from BUNDLE_EMBEDDING_SPEC §4a.1.
// Every consumer asserts this parses with ZERO diagnostics.
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
    '/roadmap/archive': { purpose: 'done items, moved here by the owner\u2019s tooling' },
    '/roadmap/board': { purpose: 'the kanban view of /roadmap', bundle: true },
    '/specs': { purpose: 'one spec per area' },
    '/context': { purpose: 'the resident context set and the routed documents' },
  },
} as const;

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
    name: 'reserved record-set name is dropped, the rest survive',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"__proto__":{"dir":"/x","record":"opaque"},"ok":{"dir":"/y","record":"opaque"}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: '§4a.5 key hygiene — `__proto__` as a record-set name refuses that set, the block still parses',
  },
  {
    name: 'reserved wellKnown name refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","record":"mdx-frontmatter","wellKnown":{"__proto__":"frontmatter.title"}}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: 'a `__proto__` wellKnown key is refused (the rest of the layout survives)',
  },
  {
    name: 'reserved `from` segment refuses',
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","record":"mdx-frontmatter","wellKnown":{"title":"frontmatter.__proto__"}}}}',
    ),
    accept: true,
    diagnostics: ['reserved-key'],
    why: 'a `from` path whose segment is `__proto__` is refused',
  },
  {
    name: 'schema $fs: refused',
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', record: 'mdx-frontmatter', schema: '$fs:/x.json' } } },
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
    layout: { version: 1, recordSets: { roadmap: { dir: '/../escape', record: 'opaque' } } },
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
    layout: { version: 1, recordSets: { roadmap: { dir: '/roadmap', record: 'yaml' } } },
    accept: true,
    diagnostics: ['bad-record'],
    why: 'record must be one of the closed set',
  },
  {
    name: 'layoutFrom with a revision refused',
    layout: { version: 1, layoutFrom: { app: 'github:immediately-run/grove@main', commit: '0123abc' } },
    accept: true,
    diagnostics: ['bad-layout-from'],
    why: 'layoutFrom.app is a revision-less identity; the revision lives in commit (§4a.1)',
  },
];

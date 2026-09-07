// The bundle LAYOUT grammar — one canonical parser for the `layout` block an owner
// writes in its bundle marker (`immediately.run.json`) to describe its own tree
// (BUNDLE_EMBEDDING_SPEC §4a; PLATFORM_LAYERING_SPEC §5.1's tier test — a second
// consumer needs it, so it lives beside the frontmatter canon rather than in any
// one consumer).
//
// THREE CONSUMERS READ THE SAME DECLARATION the same way: the docs corpus checker
// (`check-docs-wiki`), the host at mount resolution, and any projecting app. Three
// parsers would be three grammars; this is the one (`BUNDLE_EMBEDDING §4a.4`, Open
// question 10: a separate `@immediately-run/bundle` package is not warranted until
// a second non-MDX consumer exists).
//
// WHAT IT VALIDATES — the SHAPE of the declaration, nothing else. It does not read
// files, does not compile a JSON Schema, does not fetch. Record validation against
// `schema` is the consumer's job (the docs checker); this parser only checks the
// schema path is bundle-relative. `writable`/`frozen` are PARSED, not interpreted:
// inheritance semantics (never inherited from a provider default) are the host's
// rule, and the parser has no notion of who declared the block.
//
// SECURITY (BUNDLE_EMBEDDING §4a.5). A layout grants nothing: it is read from
// content, so it is untrusted like every marker value (SPACES_UI R-SPACES-11), and
// it is bounded as an interpreter fed by content:
//   • every path and glob is hygiene-checked at parse; `schema` is bundle-relative
//     (`$fs:` refused — the FS_PREFIX constant already exported from linkSpaceCore);
//   • every KEY NAMESPACE the attacker controls — record-set names, `tree` paths,
//     `wellKnown` names, `from` segments, `id.from`, `terminal.movesTo`, `unique`
//     entries — rejects `__proto__` / `constructor` / `prototype`, and the parser
//     builds null-prototype objects (one `safeKey` helper, not five copies);
//   • every bound is a named limit in LAYOUT_LIMITS, one diagnostic code each;
//   • a malformed or unknown-`version` block degrades to `null` + diagnostics —
//     the bundle still opens, the description is just absent.
import { FS_PREFIX, normalizeAbsolute } from './linkSpaceCore';

export const LAYOUT_GRAMMAR_VERSION = 1;

/** The §4a.5 bounds, one name each. Exceeding any one is a fatal refusal (`null`)
 *  with the matching diagnostic code — an interpreter must be bounded, and a
 *  hostile layout that claims ten thousand record sets is a denial-of-service
 *  delivered by content. */
export interface LayoutLimits {
  /** Maximum number of record sets in the `recordSets` object. */
  recordSets: number;
  /** Maximum number of entries in the `tree` object. */
  treeEntries: number;
  /** Maximum `unique` references a single record set may declare. */
  uniqueFanOut: number;
  /** Maximum length of a `select` basename glob, in characters. */
  selectGlobLength: number;
  /** Maximum number of `wellKnown` fields on a single record set. */
  wellKnownNames: number;
}

export const LAYOUT_LIMITS: LayoutLimits = {
  recordSets: 64,
  treeEntries: 256,
  uniqueFanOut: 32,
  selectGlobLength: 256,
  wellKnownNames: 16,
};

/** The closed record grammars of §4a.1/§4.1: `mdx-frontmatter` (one record per
 *  MDX file, fields from frontmatter), `json-file` (one record per JSON file), and
 *  `opaque` (a consumer may list but never parse — the media-type default). */
export type RecordGrammar = 'mdx-frontmatter' | 'json-file' | 'opaque';

/** One well-known record field (a `from` path, or a bare string as shorthand).
 *  `order` carries an optional `meaning` (`execution` vs `display`). */
export interface WellKnownField {
  from: string;
  meaning?: 'execution' | 'display';
}

/** The `status` well-known field, which declares its lifecycle `values` and an
 *  optional `terminal` — the value that ends the lifecycle and, when the owner's
 *  convention is a file move, the record set it moves to. `terminal.value` is by
 *  definition outside `values`. */
export interface StatusField {
  from: string;
  values?: string[];
  terminal?: { value: string; movesTo: string };
}

/** The closed well-known vocabulary (§4a.1): `title`, `body`, `status`, `order`,
 *  `labels`, `date`, `summary`. This representation is `Record<string, …>`, not a
 *  fixed interface, because the parser keys player-controlled names
 *  (null-prototype, hygiene-checked) rather than trusting the vocabulary. */
export type WellKnownFields = Record<string, WellKnownField | StatusField>;

/** The category an `id` derives a record's identity from: the file name's stem, or
 *  a dotted frontmatter path. */
export interface RecordId {
  from: string;
}

/** One record set — a directory of records the bundle contains. */
export interface RecordSet {
  /** Bundle-absolute (`/…`), normalized directory. */
  dir: string;
  /** Basename glob selecting records directly in `dir` (never descendants). */
  select?: string;
  /** `select` recurses into descendants (off by default — the roadmap archive is a
   *  sibling record set, not these descendants). */
  recursive?: boolean;
  /** The record grammar; `opaque` by definition when only a `mediaType` names it. */
  record?: RecordGrammar;
  /** Bundle-relative JSON Schema (never `$fs:`); refused on an opaque record set. */
  schema?: string;
  /** IANA media type (or list), lowercase, no parameters — description only. */
  mediaType?: string | string[];
  id?: RecordId;
  /** The other record sets this id must not collide with. */
  unique?: string[];
  wellKnown?: WellKnownFields;
  /** Fields a consumer may write (parsed, never interpreted here). */
  writable?: string[];
  /** Whole-record-set `writable: []` shorthand (parsed, never interpreted). */
  frozen?: boolean;
}

/** One `tree` entry — a human- and agent-readable directory description. */
export interface TreeEntry {
  purpose?: string;
  /** `true` marks a nested bundle (the directory carries its own marker). */
  bundle?: boolean;
}

/** An owner-pinned published default (`§4a.1`) instead of an own `recordSets`/`tree`.
 *  Parsed as data, NEVER fetched (`§4a.1`, rev 4b PR #186 SA-11/CB-3). */
export interface LayoutFrom {
  app: string;
  commit: string;
}

export interface BundleLayout {
  version: number;
  recordSets: Record<string, RecordSet>;
  tree?: Record<string, TreeEntry>;
  layoutFrom?: LayoutFrom;
}

/** A closed, typed diagnostic code — the host maps these to its `MarkerRejection`
 *  diagnostics, the checker prints them. */
export type LayoutDiagnosticCode =
  | 'layout-not-object'
  | 'unsupported-version'
  | 'missing-record-sets'
  | 'record-sets-not-object'
  | 'limit-record-sets'
  | 'limit-tree-entries'
  | 'limit-select-glob'
  | 'limit-unique'
  | 'limit-well-known'
  | 'reserved-key'
  | 'bad-record-set'
  | 'bad-dir'
  | 'bad-select'
  | 'bad-recursive'
  | 'bad-record'
  | 'bad-schema'
  | 'schema-on-opaque'
  | 'bad-media-type'
  | 'bad-id'
  | 'bad-unique'
  | 'bad-well-known'
  | 'bad-writable'
  | 'bad-frozen'
  | 'bad-tree'
  | 'bad-tree-entry'
  | 'bad-layout-from'
  | 'missing-select'
  | 'missing-record'
  | 'layout-from-conflict';

export interface LayoutDiagnostic {
  code: LayoutDiagnosticCode;
  /** The JSON path of the offending value. Empty only when the failure names no
   *  single value (e.g. `layout-not-object`); whole-block refusals that DO name a
   *  value (a bad `version`, a non-object `recordSets`) carry its path. */
  path: string;
  message: string;
}

export interface LayoutParseResult {
  /** The parsed layout, or `null` when the block is malformed/unknown-version
   *  (the bundle still opens; the description is just absent). */
  layout: BundleLayout | null;
  diagnostics: LayoutDiagnostic[];
}

type Dict = Record<string, unknown>;

const isObject = (v: unknown): v is Dict =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** The §4a.5 key-hygiene predicate, used for EVERY player-controlled key namespace
 *  (record-set names, `tree` paths, `wellKnown` names, `from` segments, `id.from`,
 *  `terminal.movesTo`, `unique` entries). A name is safe when it is a non-empty
 *  string, carries no NUL, and is not one of the three prototype keys. Structural —
 *  we do not reach for a regex to detect prototype keys; we check the literal. */
const safeKey = (name: unknown): name is string =>
  typeof name === 'string' && name.length > 0 && !name.includes('\0') && !RESERVED_KEYS.has(name);

/** A bundle-absolute path, normalized on the way out: starts with `/`, no `\`/NUL,
 *  no `.`/`..`/empty segment (the parser REFUSES traversal rather than clamping it —
 *  a layout is a description, and a `..` in one is an author error, not a
 *  navigation). Tolerates ONE trailing slash — `at: '/items/'` is the spec §3
 *  spelling and the host's `normalizeAt` normalizer accepts it; `normalizeAbsolute`
 *  drops it before storage. */
const cleanBundlePath = (p: unknown): p is string => {
  if (typeof p !== 'string' || !p.startsWith('/')) return false;
  if (p.includes('\\') || p.includes('\0')) return false;
  let inner = p.slice(1);
  if (inner.endsWith('/')) inner = inner.slice(0, -1);
  return inner.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
};

/** A `select` basename glob: no separators, no `..`, no NUL, non-empty. Its LENGTH
 *  bound is the `limit-select-glob` fatal, checked in the pre-pass, not here — one
 *  diagnostic code per §4a.5 bound, never two. */
const cleanSelect = (s: unknown): s is string =>
  typeof s === 'string' &&
  s.length > 0 &&
  !s.includes('/') &&
  !s.includes('\\') &&
  !s.includes('..') &&
  !s.includes('\0');

const isReserved = (name: unknown): name is string =>
  typeof name === 'string' && RESERVED_KEYS.has(name);

/** Validate a dotted own-property `from` path (`filename`, `content`, `mtime`,
 *  `size`, `frontmatter.*`). A reserved segment (`__proto__`/`constructor`/
 *  `prototype`) is the §4a.5 key-hygiene refusal (`reserved-key`); any other shape
 *  failure is the caller's `badCode`. Returns the path, or `null` after pushing one
 *  diagnostic. */
function validateFromPath(
  from: unknown,
  path: string,
  badCode: LayoutDiagnosticCode,
  diagnostics: LayoutDiagnostic[],
): string | null {
  if (typeof from !== 'string' || from.length === 0 || from.includes('\0')) {
    diagnostics.push(diag(badCode, path, 'from must be a non-empty string'));
    return null;
  }
  const segments = from.split('.');
  if (segments.some(isReserved)) {
    diagnostics.push(diag('reserved-key', path, 'a `from` segment is a reserved key'));
    return null;
  }
  if (segments.some((seg) => seg === '')) {
    diagnostics.push(diag(badCode, path, '`from` segments must be non-empty'));
    return null;
  }
  return from;
}

/** RFC 6838 `type/subtype` token pair — lowercase, no parameters, one slash. The
 *  registry is NOT consulted, so a private `application/x-…` type is legal. */
const MEDIA_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const isMediaType = (t: unknown): t is string => {
  if (typeof t !== 'string') return false;
  const slash = t.indexOf('/');
  if (slash === -1 || slash !== t.lastIndexOf('/')) return false;
  return MEDIA_TOKEN.test(t.slice(0, slash)) && MEDIA_TOKEN.test(t.slice(slash + 1));
};

const RECORD_GRAMMARS = new Set<RecordGrammar>(['mdx-frontmatter', 'json-file', 'opaque']);

/** The §4a.1 closed well-known vocabulary — `title`, `body`, `status`, `order`,
 *  `labels`, `date`, `summary`. A generic consumer may rely on these without
 *  reading the schema; anything else is not a well-known field and is refused. */
const WELL_KNOWN_FIELDS = new Set(['title', 'body', 'status', 'order', 'labels', 'date', 'summary']);

/** The only `from` sources a well-known field may name on an OPAQUE record set
 *  (§4a.1 — there is no record to read, so the source is `filename` or file
 *  metadata `mtime`/`size`, never `frontmatter.*`). */
const OPAQUE_WELL_KNOWN_SOURCES = new Set(['filename', 'mtime', 'size']);

const diag = (code: LayoutDiagnosticCode, path: string, message: string): LayoutDiagnostic => ({
  code,
  path,
  message,
});

function parseWellKnownField(
  name: string,
  value: unknown,
  path: string,
  diagnostics: LayoutDiagnostic[],
): WellKnownField | StatusField | null {
  if (typeof value === 'string') {
    if (validateFromPath(value, path, 'bad-well-known', diagnostics) === null) return null;
    return { from: value };
  }
  if (!isObject(value)) {
    diagnostics.push(diag('bad-well-known', path, 'wellKnown field must be a `from` string or object'));
    return null;
  }
  const fromPath = validateFromPath(value.from, `${path}.from`, 'bad-well-known', diagnostics);
  if (fromPath === null) return null;
  const out: WellKnownField | StatusField = { from: fromPath };
  // §4a.1 — the extra structure is per-field, not portable: `values`/`terminal`
  // belong to `status` only, `meaning` to `order` only. Structure on the wrong
  // field is refused (the closed vocabulary is a shape promise, not a hint).
  if ('values' in value) {
    if (name !== 'status') {
      diagnostics.push(diag('bad-well-known', `${path}.values`, '`values` belongs to the status field only'));
      return null;
    }
    const values = value.values;
    if (!Array.isArray(values) || !values.every((x) => typeof x === 'string')) {
      diagnostics.push(diag('bad-well-known', `${path}.values`, 'status values must be an array of strings'));
      return null;
    }
    (out as StatusField).values = (values as string[]).slice();
  }
  if ('terminal' in value) {
    if (name !== 'status') {
      diagnostics.push(diag('bad-well-known', `${path}.terminal`, '`terminal` belongs to the status field only'));
      return null;
    }
    const terminal = value.terminal;
    if (!isObject(terminal)) {
      diagnostics.push(diag('bad-well-known', `${path}.terminal`, 'terminal must be an object'));
      return null;
    }
    if (typeof terminal.value !== 'string') {
      diagnostics.push(diag('bad-well-known', `${path}.terminal.value`, 'terminal.value must be a string'));
      return null;
    }
    if (isReserved(terminal.movesTo)) {
      diagnostics.push(diag('reserved-key', `${path}.terminal.movesTo`, 'terminal.movesTo is a reserved key'));
      return null;
    }
    if (typeof terminal.movesTo !== 'string' || !safeKey(terminal.movesTo)) {
      diagnostics.push(diag('bad-well-known', `${path}.terminal.movesTo`, 'terminal.movesTo must be a safe record-set name'));
      return null;
    }
    (out as StatusField).terminal = { value: terminal.value, movesTo: terminal.movesTo };
  }
  if ('meaning' in value) {
    if (name !== 'order') {
      diagnostics.push(diag('bad-well-known', `${path}.meaning`, '`meaning` belongs to the order field only'));
      return null;
    }
    const meaning = value.meaning;
    if (meaning !== 'execution' && meaning !== 'display') {
      diagnostics.push(diag('bad-well-known', `${path}.meaning`, 'order meaning must be `execution` or `display`'));
      return null;
    }
    (out as WellKnownField).meaning = meaning;
  }
  return out;
}

function parseRecordSet(
  value: unknown,
  path: string,
  diagnostics: LayoutDiagnostic[],
): RecordSet | null {
  if (!isObject(value)) {
    diagnostics.push(diag('bad-record-set', path, 'record set must be an object'));
    return null;
  }
  if (!cleanBundlePath(value.dir)) {
    diagnostics.push(
      diag('bad-dir', `${path}.dir`, 'dir must be a bundle-absolute, normalized path (no .., NUL or backslash)'),
    );
    return null;
  }

  const out: RecordSet = { dir: normalizeAbsolute(value.dir) };

  if (value.select === undefined) {
    diagnostics.push(diag('missing-select', `${path}.select`, 'a record set must declare a select glob'));
    return null;
  }
  if (!cleanSelect(value.select)) {
    diagnostics.push(
      diag('bad-select', `${path}.select`, 'select must be a basename glob with no separator, .. or NUL'),
    );
    return null;
  }
  out.select = value.select;
  if (value.recursive !== undefined) {
    if (typeof value.recursive !== 'boolean') {
      diagnostics.push(diag('bad-recursive', `${path}.recursive`, 'recursive must be a boolean'));
      return null;
    }
    out.recursive = value.recursive;
  }

  let record = value.record;
  if (record !== undefined) {
    if (typeof record !== 'string' || !RECORD_GRAMMARS.has(record as RecordGrammar)) {
      diagnostics.push(
        diag('bad-record', `${path}.record`, 'record must be one of mdx-frontmatter | json-file | opaque'),
      );
      return null;
    }
  }

  let mediaTypes: string[] | undefined;
  if (value.mediaType !== undefined) {
    const list = Array.isArray(value.mediaType) ? value.mediaType : [value.mediaType];
    if (list.length === 0 || !list.every(isMediaType)) {
      diagnostics.push(
        diag('bad-media-type', `${path}.mediaType`, 'mediaType must be a lowercase RFC 6838 type/subtype pair'),
      );
      return null;
    }
    mediaTypes = list;
    // §4a.1: "a record set with mediaType and no record is record: 'opaque' by definition."
    if (record === undefined) record = 'opaque';
  }

  if (value.schema !== undefined) {
    if (record === 'opaque') {
      diagnostics.push(
        diag('schema-on-opaque', `${path}.schema`, 'schema is refused on a mediaType-only (opaque) record set'),
      );
      return null;
    }
    if (typeof value.schema !== 'string' || value.schema.startsWith(FS_PREFIX) || !cleanBundlePath(value.schema)) {
      diagnostics.push(
        diag('bad-schema', `${path}.schema`, 'schema must be a bundle-relative path (never $fs:)'),
      );
      return null;
    }
    out.schema = normalizeAbsolute(value.schema);
  }

  if (record === undefined && mediaTypes === undefined) {
    diagnostics.push(
      diag(
        'missing-record',
        path,
        'a record set must declare record or mediaType — the grammar that makes a file a record',
      ),
    );
    return null;
  }

  if (record !== undefined) out.record = record as RecordGrammar;
  if (mediaTypes !== undefined) out.mediaType = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes.slice();

  if (value.id !== undefined) {
    const id = value.id;
    if (!isObject(id)) {
      diagnostics.push(diag('bad-id', `${path}.id`, 'id must be { from }'));
      return null;
    }
    const idFrom = validateFromPath(id.from, `${path}.id.from`, 'bad-id', diagnostics);
    if (idFrom === null) return null;
    out.id = { from: idFrom };
  }

  if (value.unique !== undefined) {
    if (!Array.isArray(value.unique)) {
      diagnostics.push(diag('bad-unique', `${path}.unique`, 'unique must be an array of record-set names'));
      return null;
    }
    for (const u of value.unique) {
      if (isReserved(u)) {
        diagnostics.push(diag('reserved-key', `${path}.unique`, 'a unique entry is a reserved key'));
        return null;
      }
      if (!safeKey(u)) {
        diagnostics.push(diag('bad-unique', `${path}.unique`, 'unique entries must be safe record-set names'));
        return null;
      }
    }
    out.unique = (value.unique as string[]).slice();
  }

  if (value.wellKnown !== undefined) {
    if (!isObject(value.wellKnown)) {
      diagnostics.push(diag('bad-well-known', `${path}.wellKnown`, 'wellKnown must be an object'));
      return null;
    }
    const wellKnown: WellKnownFields = Object.create(null);
    const isOpaque = record === 'opaque';
    for (const name of Object.keys(value.wellKnown)) {
      if (isReserved(name)) {
        diagnostics.push(diag('reserved-key', `${path}.wellKnown`, `wellKnown name ${JSON.stringify(name)} is reserved`));
        return null;
      }
      if (!WELL_KNOWN_FIELDS.has(name)) {
        diagnostics.push(
          diag('bad-well-known', `${path}.wellKnown`, `wellKnown name ${JSON.stringify(name)} is not in the closed vocabulary`),
        );
        return null;
      }
      const field = parseWellKnownField(name, value.wellKnown[name], `${path}.wellKnown.${name}`, diagnostics);
      if (field === null) return null;
      // §4a.1 — on an opaque record set the only well-known sources are `filename`
      // and file metadata (`mtime`/`size`) — there is no record to read.
      if (isOpaque && !OPAQUE_WELL_KNOWN_SOURCES.has(field.from)) {
        diagnostics.push(
          diag('bad-well-known', `${path}.wellKnown.${name}`, 'on an opaque record set a wellKnown field may only name filename/mtime/size'),
        );
        return null;
      }
      wellKnown[name] = field;
    }
    out.wellKnown = wellKnown;
  }

  if (value.writable !== undefined) {
    if (!Array.isArray(value.writable) || !value.writable.every((x) => typeof x === 'string' && !x.includes('\0'))) {
      diagnostics.push(diag('bad-writable', `${path}.writable`, 'writable must be an array of strings'));
      return null;
    }
    out.writable = (value.writable as string[]).slice();
  }

  if (value.frozen !== undefined) {
    if (typeof value.frozen !== 'boolean') {
      diagnostics.push(diag('bad-frozen', `${path}.frozen`, 'frozen must be a boolean'));
      return null;
    }
    out.frozen = value.frozen;
  }

  return out;
}

/**
 * Parse a marker's `layout` block into its typed description — or `null` plus
 * diagnostics when the block is malformed or unknown-`version`. NEVER throws: a
 * hostile marker must degrade to "no layout", never to a host error
 * (`SPACES_UI` R-SPACES-11). Pass the VALUE of the marker's `layout` key, not the
 * whole marker.
 *
 * Failure levels, two of them:
 *  • **whole-block** (`layout: null`) — not an object, unknown/missing `version`,
 *    no `recordSets`/`layoutFrom`, `recordSets` not an object, or any §4a.5 bound
 *    exceeded. The bundle still opens; the description is simply absent.
 *  • **per-entry** (`layout` present, the entry dropped) — a reserved key, a bad
 *    `dir`/`select`/`schema`/`mediaType`/`id`/`unique`/`wellKnown`/`writable`/
 *    `frozen`, a bad `tree` entry, or a bad `layoutFrom`. Each drop carries exactly
 *    one diagnostic naming the offending path.
 */
export function parseBundleLayout(json: unknown): LayoutParseResult {
  const diagnostics: LayoutDiagnostic[] = [];
  if (!isObject(json)) {
    return { layout: null, diagnostics: [diag('layout-not-object', '', 'layout must be an object')] };
  }
  if (json.version !== LAYOUT_GRAMMAR_VERSION) {
    return {
      layout: null,
      diagnostics: [diag('unsupported-version', 'version', `unsupported layout grammar version ${String(json.version)}`)],
    };
  }
  if (json.recordSets === undefined && json.layoutFrom === undefined) {
    return {
      layout: null,
      diagnostics: [diag('missing-record-sets', '', 'layout must declare recordSets or layoutFrom')],
    };
  }

  const layout: BundleLayout = { version: LAYOUT_GRAMMAR_VERSION, recordSets: Object.create(null) };

  if (json.recordSets !== undefined) {
    if (!isObject(json.recordSets)) {
      return {
        layout: null,
        diagnostics: [diag('record-sets-not-object', 'recordSets', 'recordSets must be an object')],
      };
    }
    const names = Object.keys(json.recordSets);
    if (names.length > LAYOUT_LIMITS.recordSets) {
      return {
        layout: null,
        diagnostics: [
          diag(
            'limit-record-sets',
            'recordSets',
            `recordSets has ${names.length} entries; the bound is ${LAYOUT_LIMITS.recordSets}`,
          ),
        ],
      };
    }
    // Per-record-set bounds (§4a.5), checked up front so a single oversize `select`,
    // `unique` fan-out or `wellKnown` set fails the WHOLE block (an interpreter must
    // be bounded) with its matching `limit-*` diagnostic — never a field-level drop.
    for (const name of names) {
      if (!safeKey(name)) continue;
      const raw = json.recordSets[name];
      if (!isObject(raw)) continue;
      if (typeof raw.select === 'string' && raw.select.length > LAYOUT_LIMITS.selectGlobLength) {
        return {
          layout: null,
          diagnostics: [
            diag(
              'limit-select-glob',
              `recordSets.${name}.select`,
              `select glob is ${raw.select.length} characters; the bound is ${LAYOUT_LIMITS.selectGlobLength}`,
            ),
          ],
        };
      }
      if (Array.isArray(raw.unique) && raw.unique.length > LAYOUT_LIMITS.uniqueFanOut) {
        return {
          layout: null,
          diagnostics: [
            diag(
              'limit-unique',
              `recordSets.${name}.unique`,
              `unique names ${raw.unique.length} record sets; the bound is ${LAYOUT_LIMITS.uniqueFanOut}`,
            ),
          ],
        };
      }
      if (isObject(raw.wellKnown) && Object.keys(raw.wellKnown).length > LAYOUT_LIMITS.wellKnownNames) {
        return {
          layout: null,
          diagnostics: [
            diag(
              'limit-well-known',
              `recordSets.${name}.wellKnown`,
              `wellKnown has ${Object.keys(raw.wellKnown).length} fields; the bound is ${LAYOUT_LIMITS.wellKnownNames}`,
            ),
          ],
        };
      }
    }
    for (const name of names) {
      if (!safeKey(name)) {
        diagnostics.push(
          diag(
            isReserved(name) ? 'reserved-key' : 'bad-record-set',
            'recordSets',
            `record-set name ${JSON.stringify(name)} is ${isReserved(name) ? 'reserved' : 'not a safe key'}`,
          ),
        );
        continue;
      }
      const parsed = parseRecordSet(json.recordSets[name], `recordSets.${name}`, diagnostics);
      if (parsed) layout.recordSets[name] = parsed;
    }
  }

  if (json.tree !== undefined) {
    if (!isObject(json.tree)) {
      diagnostics.push(diag('bad-tree', 'tree', 'tree must be an object'));
    } else {
      const paths = Object.keys(json.tree);
      if (paths.length > LAYOUT_LIMITS.treeEntries) {
        return {
          layout: null,
          diagnostics: [
            diag('limit-tree-entries', 'tree', `tree has ${paths.length} entries; the bound is ${LAYOUT_LIMITS.treeEntries}`),
          ],
        };
      }
      const tree: Record<string, TreeEntry> = Object.create(null);
      for (const path of paths) {
        const entry = json.tree[path];
        if (!cleanBundlePath(path)) {
          diagnostics.push(diag('bad-tree', `tree[${JSON.stringify(path)}]`, 'tree path must be a bundle-absolute, normalized path'));
          continue;
        }
        if (!isObject(entry)) {
          diagnostics.push(diag('bad-tree-entry', `tree[${JSON.stringify(path)}]`, 'tree entry must be an object'));
          continue;
        }
        const out: TreeEntry = {};
        if ('purpose' in entry) {
          if (typeof entry.purpose !== 'string') {
            diagnostics.push(diag('bad-tree-entry', `tree[${JSON.stringify(path)}].purpose`, 'purpose must be a string'));
            continue;
          }
          out.purpose = entry.purpose;
        }
        if ('bundle' in entry) {
          if (typeof entry.bundle !== 'boolean') {
            diagnostics.push(diag('bad-tree-entry', `tree[${JSON.stringify(path)}].bundle`, 'bundle must be a boolean'));
            continue;
          }
          out.bundle = entry.bundle;
        }
        tree[normalizeAbsolute(path)] = out;
      }
      layout.tree = tree;
    }
  }

  if (json.layoutFrom !== undefined) {
    // §4a.1 — `layoutFrom` is the alternative to an own `recordSets`/`tree` block
    // ("instead of"), so providing it beside either is a contradiction; the own
    // block wins and the adopted default is dropped.
    if (json.recordSets !== undefined || json.tree !== undefined) {
      diagnostics.push(
        diag('layout-from-conflict', 'layoutFrom', 'layoutFrom is instead-of an own recordSets/tree block (§4a.1), not beside one'),
      );
    } else {
      const layoutFrom = json.layoutFrom;
      if (
        !isObject(layoutFrom) ||
        typeof layoutFrom.app !== 'string' ||
        typeof layoutFrom.commit !== 'string' ||
        layoutFrom.app.includes('@')
      ) {
        diagnostics.push(
          diag('bad-layout-from', 'layoutFrom', 'layoutFrom must be { app (revision-less), commit }'),
        );
      } else {
        layout.layoutFrom = { app: layoutFrom.app, commit: layoutFrom.commit };
      }
    }
  }

  return { layout, diagnostics };
}

/** Is `path` inside the `view` subtree (itself, or a descendant)? A `..`-free,
 *  prefix-scoped test — `/roadmap-foo` is NOT inside `/roadmap`. The root view
 *  (`/`) keeps every path. */
const inView = (path: string, view: string): boolean =>
  view === '/' || path === view || path.startsWith(view + '/');

/**
 * Prune a parsed layout down to a consumer's `subtree` view (`§4a.3`, G-BE-19).
 * Drops every record set whose `dir` lies outside `subtree`, every `tree` entry
 * outside it, and every `unique` reference to a set that was pruned OUT (references
 * to names the owner never declared are the CHECKER's finding, not the prune's —
 * the prune rewrites the owner's declaration no further than §4a.3 prescribes).
 * `layoutFrom` names the WHOLE bundle's default, so it is carried only at the root
 * view and dropped from any proper subtree. Returns a NEW layout; the input is not
 * mutated. Nothing the consuming app could actually read is lost — the prune keeps
 * the chroot's `ENOENT` answers from leaking as a structured existence map of the
 * owner's root (`threat_model` P7).
 */
export function pruneLayoutToView(layout: BundleLayout, subtree: string): BundleLayout {
  const view = normalizeAbsolute(subtree);

  const recordSets: Record<string, RecordSet> = Object.create(null);
  const prunedOut = new Set<string>();
  for (const [name, rs] of Object.entries(layout.recordSets)) {
    if (inView(rs.dir, view)) recordSets[name] = rs;
    else prunedOut.add(name);
  }

  for (const name of Object.keys(recordSets)) {
    const rs = recordSets[name];
    if (rs.unique) {
      const kept = rs.unique.filter((u) => !prunedOut.has(u));
      if (kept.length !== rs.unique.length) {
        const { unique: _dropped, ...rest } = rs;
        void _dropped;
        recordSets[name] = kept.length ? { ...rs, unique: kept } : rest;
      }
    }
  }

  const pruned: BundleLayout = { version: layout.version, recordSets };

  if (layout.tree) {
    const tree: Record<string, TreeEntry> = Object.create(null);
    for (const [path, entry] of Object.entries(layout.tree)) {
      if (inView(path, view)) tree[path] = entry;
    }
    pruned.tree = tree;
  }

  if (layout.layoutFrom && view === '/') pruned.layoutFrom = layout.layoutFrom;

  return pruned;
}

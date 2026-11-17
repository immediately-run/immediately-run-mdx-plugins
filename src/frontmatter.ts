// The frontmatter parser every reader of a corpus shares (PLATFORM_LAYERING_SPEC §5 / S4,
// R3-277a; YAML-backed since R3-1347).
//
// WHY IT LIVES HERE. A corpus is read on two paths: the host's metadata scan (the
// transpiler, which a forked wiki's index comes from) and the readers that run outside the
// bundler — Grove's dispatch-mode `corpusScan`, the docs corpus checker, kanban's projection.
// They must see the same values, so they call the same function, and the transpiler
// delegates to this one (R3-1348). This package is already the canon for the other half of
// that agreement (the slug grammar, R3-277).
//
// WHAT IT IS. A fence and one `yaml.parse` call with no options — YAML 1.2, the core schema,
// the defaults the host has always used. It replaced a hand-written subset reader (strings
// only, one level of nesting, unknown lines ignored) that agreed with the host on 1,259 of
// 2,880 real pages, and let `description: x (nav: top)` pass every check while the host
// rejected it.
//
// WHAT IT KEEPS FROM THAT READER. It never throws. A corpus is a foreign author's tree read
// at runtime, so a block that does not parse degrades to "an entry with no metadata", and
// the reason is returned in `error` for a checker to report. `data` is then `{}`: a
// half-read block is exactly the divergence this module exists to remove.
import { parse, parseDocument } from 'yaml';

/** A parsed frontmatter value: whatever YAML 1.2's core schema produces. */
export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

/** One document's parsed frontmatter block. */
export type ParsedFrontmatter = Record<string, FrontmatterValue>;

/** Why a block that is present yielded no data. */
export interface FrontmatterError {
  /**
   * `yaml`: the block is not valid YAML. `not-a-map`: it parses, but to a list, a scalar or
   * a tagged value rather than a map. `not-json`: it parses to a map holding a value outside
   * {@link FrontmatterValue}, which a metadata envelope of JSON values cannot carry — a
   * `Date`, byte array or `Set` from an explicit tag (`!!timestamp`, `!!binary`, `!!set`),
   * `Infinity` or `NaN` from `.inf` / `.nan`, or an alias cycle (`a: &x [*x]`).
   */
  kind: 'yaml' | 'not-a-map' | 'not-json';
  /** The parser's message, first line only, without its own position suffix. */
  message: string;
  /**
   * `yaml`'s own error code when it raised one (`BLOCK_AS_IMPLICIT_KEY`, `DUPLICATE_KEY`,
   * `RESOURCE_EXHAUSTION`, …). Its presence is how a test tells a bounded parse error from
   * a raw runtime error: deeply nested input once overflowed the stack (GHSA-48c2-rrv3-qjmp,
   * fixed in yaml 2.8.3) and now answers `RESOURCE_EXHAUSTION`.
   */
  code?: string;
  /** 1-based line in the WHOLE document (the opening fence is line 1), when known. */
  line?: number;
  /** 1-based column on that line, when known. */
  column?: number;
}

export interface FrontmatterParseResult {
  /** The parsed block; `{}` when the document has none, or when `error` is set. */
  data: ParsedFrontmatter;
  /** Everything after the closing `---`, with leading blank lines trimmed. */
  body: string;
  /**
   * Everything after the closing `---` line, untrimmed — what a compiler consumes, so
   * source positions stay true. A leading BOM is removed. Equal to the input (minus a BOM)
   * when there is no frontmatter.
   */
  content: string;
  /**
   * Whether a `--- … ---` block was actually present and closed.
   *
   * Distinct from `data` being empty: `---\n---\n` HAS frontmatter and no keys, while
   * a document that opens `---` and never closes it has none. A tool that rewrites
   * frontmatter needs to know which it is looking at — inserting a second block into
   * a file that already has one is how a corpus grows two `id:` keys.
   */
  hadFrontmatter: boolean;
  /** Set when a block is present but yields no data. Never set when `hadFrontmatter` is false. */
  error?: FrontmatterError;
}

// A leading `---` fence (trailing spaces allowed), the block, and a closing line that is
// just `---` (trailing spaces allowed), LF or CRLF. Moved verbatim from the transpiler
// (`src/mdx/frontmatter.ts`, gray-matter's delimiter rule), which deletes its copy (R3-1348).
const FRONTMATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

// `yaml` ends a message with " at line N, column M:" and then a code frame. The position
// is reported separately (and relative to the document, not the block), so both go.
const POSITION_SUFFIX = / at line \d+, column \d+:?$/;

// The block starts on the line after the opening fence, so its line 1 is the file's line 2.
const BLOCK_FIRST_LINE = 2;

function toError(e: unknown): FrontmatterError {
  const raw = e instanceof Error ? e.message : String(e);
  const err: FrontmatterError = {
    kind: 'yaml',
    message: raw.split('\n')[0].replace(POSITION_SUFFIX, '').trim(),
  };
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string') err.code = code;
  const pos = (e as { linePos?: Array<{ line: number; col: number }> } | null)?.linePos?.[0];
  if (pos) {
    err.line = pos.line + BLOCK_FIRST_LINE - 1;
    err.column = pos.col;
  }
  return err;
}

/** The document line and column of a character offset within the block. */
function positionOf(yamlText: string, offset: number): { line: number; column: number } {
  const before = yamlText.slice(0, offset);
  const lastBreak = before.lastIndexOf('\n');
  return {
    line: BLOCK_FIRST_LINE + (before.match(/\n/g)?.length ?? 0),
    column: offset - lastBreak, // 1-based: lastBreak is -1 on the block's first line
  };
}

type PathSegment = string | number;

/** A map as `yaml` returns one untagged: an object whose prototype is `Object.prototype` (or null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** How a value reads in a message: `a list`, `a string`, `a Date`, … */
function describe(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object' && value !== null) return `a ${(value as object).constructor?.name ?? 'object'}`;
  return `a ${typeof value}`;
}

/** `['meta', 'tags', 1]` → `meta.tags[1]`. */
function formatPath(path: PathSegment[]): string {
  return path.map((s, i) => (typeof s === 'number' ? `[${s}]` : i === 0 ? s : `.${s}`)).join('');
}

/**
 * The first value that is not a {@link FrontmatterValue}, with its key path, or null.
 *
 * `yaml` with no options returns plain objects, arrays and primitives for untagged YAML, and
 * three things that are not JSON:
 * - a `Date`, a byte array, a `Set` or a `Map`, when an explicit tag (`!!timestamp`, …) asks;
 * - `Infinity` or `NaN`, from `.inf` / `.nan`;
 * - a CYCLE, when an alias refers to a node that contains it (`a: &x [*x]`).
 *
 * `ancestors` holds the containers on the path from the root to `value` — not every container
 * seen — so a cycle is caught while an alias used twice side by side (`b: *x`, `c: *x`) is
 * not mistaken for one. Without it this walk overflowed the stack on a cycle and broke the
 * never-throws guarantee (R3-1347 review 2-r2-0).
 */
function firstNonJson(
  value: unknown,
  path: PathSegment[],
  ancestors: Set<object>,
): { path: PathSegment[]; why: string } | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path, why: `is ${value}, which JSON cannot represent` };
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    if (ancestors.has(value)) {
      return { path, why: 'refers back to a node that contains it (a YAML alias cycle)' };
    }
    ancestors.add(value);
    const entries: Array<[PathSegment, unknown]> = Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value);
    for (const [key, child] of entries) {
      const hit = firstNonJson(child, [...path, key], ancestors);
      if (hit) return hit;
    }
    ancestors.delete(value);
    return null;
  }
  return { path, why: `is ${describe(value)} — remove its explicit YAML tag` };
}

/**
 * Split a `--- … ---` YAML frontmatter block off the top of a document and parse it.
 *
 * A file without one is not an error — it is an entry with no metadata, and every corpus
 * contains those (a draft, a `_layout.mdx`). This never throws and never discards the body:
 * a block that does not parse yields `data: {}` and an `error` naming where and why.
 */
export function parseFrontmatter(input: string): FrontmatterParseResult {
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const match = src.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: input, content: src, hadFrontmatter: false };

  const content = src.slice(match[0].length);
  const result: FrontmatterParseResult = {
    data: {},
    body: content.replace(/^(?:\r?\n)+/, ''),
    content,
    hadFrontmatter: true,
  };

  const yamlText = match[1]; // undefined for an empty `---\n---` block
  if (yamlText === undefined || !yamlText.trim()) return result;

  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch (e) {
    result.error = toError(e);
    return result;
  }
  // A block holding only comments parses to null: frontmatter with no keys, like `---\n---`.
  if (parsed === null || parsed === undefined) return result;
  // Positions below come from `parseDocument` — the same parser with no options, which just
  // succeeded on this text through `parse` — and only on these error paths.
  if (!isPlainObject(parsed)) {
    // A list, a scalar, or a tagged value (a Date, a Set) where the map should be. Point at
    // the node itself: comments or blank lines may come before it.
    const start = parseDocument(yamlText).contents?.range?.[0] ?? 0;
    result.error = {
      kind: 'not-a-map',
      message: `frontmatter must be a map of keys, not ${describe(parsed)}`,
      ...positionOf(yamlText, start),
    };
    return result;
  }
  const nonJson = firstNonJson(parsed, [], new Set());
  if (nonJson) {
    result.error = {
      kind: 'not-json',
      message: `\`${formatPath(nonJson.path)}\` ${nonJson.why}; frontmatter holds JSON values only`,
    };
    // The node at that key path, when the document can name it (a non-string key may not).
    const node = parseDocument(yamlText).getIn(nonJson.path, true) as { range?: [number, number, number] } | undefined;
    if (node?.range) Object.assign(result.error, positionOf(yamlText, node.range[0]));
    return result;
  }
  result.data = parsed as ParsedFrontmatter;
  return result;
}

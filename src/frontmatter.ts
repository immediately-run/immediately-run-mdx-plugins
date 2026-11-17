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
import { parse } from 'yaml';

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
  /** `yaml`: the block is not valid YAML. `not-a-map`: it parses, but to a list or a scalar. */
  kind: 'yaml' | 'not-a-map';
  /** The parser's message, first line only, without its own position suffix. */
  message: string;
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

function toError(kind: FrontmatterError['kind'], e: unknown): FrontmatterError {
  const raw = e instanceof Error ? e.message : String(e);
  const message = raw.split('\n')[0].replace(POSITION_SUFFIX, '').trim();
  const pos = (e as { linePos?: Array<{ line: number; col: number }> } | null)?.linePos?.[0];
  // The block starts on the line after the opening fence, so its line 1 is the file's line 2.
  return pos ? { kind, message, line: pos.line + 1, column: pos.col } : { kind, message };
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
    result.error = toError('yaml', e);
    return result;
  }
  // A block holding only comments parses to null: frontmatter with no keys, like `---\n---`.
  if (parsed === null || parsed === undefined) return result;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    result.error = {
      kind: 'not-a-map',
      message: `frontmatter must be a map of keys, not ${Array.isArray(parsed) ? 'a list' : `a ${typeof parsed}`}`,
      line: 2,
      column: 1,
    };
    return result;
  }
  result.data = parsed as ParsedFrontmatter;
  return result;
}

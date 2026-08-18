// The frontmatter parser the corpus tooling shares (PLATFORM_LAYERING_SPEC §5 / S4,
// R3-277a) — fork collapse two of four.
//
// WHY IT LIVES HERE. It is a *minimal YAML* reader for the shapes a Grove corpus
// actually uses, and it has to agree with the frontmatter the renderer sees. This
// package is already the byte-canon for the other half of that agreement (the slug
// grammar, R3-277), so a consumer that imports one gets both from the same place and
// the same version.
//
// WHAT IT IS NOT. Not a YAML implementation. It reads `key: scalar`, inline flow
// lists `key: [a, b]`, block lists (`key:` then `  - item`), and ONE level of nesting
// (`owns:` then `  concepts: [...]`) — the grammar the authoring contract documents.
// Anything else is ignored rather than rejected: a corpus is read by a viewer at
// runtime, and a file that fails to parse must degrade to "an entry with no
// metadata", never to a blank page.
//
// It had two implementations before this: the docs repo's `scripts/lib/wiki.mjs`
// (which has read the whole corpus for the generator and the conformance checker) and
// Grove's `src/lib/frontmatter.ts`, a documented port of it. They agreed — the port
// was faithful — which is precisely why the drift was worth pre-empting: nothing
// would have reported the day they stopped.

/** A parsed frontmatter value: a scalar, a list, one level of nesting, or empty. */
export type FrontmatterValue = string | string[] | Record<string, string | string[]> | null;

/** One document's parsed frontmatter block. */
export type ParsedFrontmatter = Record<string, FrontmatterValue>;

export interface FrontmatterParseResult {
  /** The parsed block; `{}` when the document has none. */
  data: ParsedFrontmatter;
  /** Everything after the closing `---`, with leading blank lines trimmed. */
  body: string;
  /**
   * Whether a `--- … ---` block was actually present and closed.
   *
   * Distinct from `data` being empty: `---\n---\n` HAS frontmatter and no keys, while
   * a document that opens `---` and never closes it has none. A tool that rewrites
   * frontmatter needs to know which it is looking at — inserting a second block into
   * a file that already has one is how a corpus grows two `id:` keys.
   */
  hadFrontmatter: boolean;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** A frontmatter value: an inline `[a, b]` list, or a scalar. */
function parseScalarOrList(rawVal: string): string | string[] {
  if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
    const inner = rawVal.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((s) => stripQuotes(s.trim()));
  }
  return stripQuotes(rawVal);
}

/**
 * Split a `--- … ---` frontmatter block off the top of a document.
 *
 * A file without one is not an error — it is an entry with no metadata, and every
 * corpus contains those (a draft, a `_layout.mdx`). This never throws and never
 * discards the body.
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { data: {}, body: content, hadFrontmatter: false };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { data: {}, body: content, hadFrontmatter: false };

  const fmLines = lines.slice(1, end);
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  const data: ParsedFrontmatter = {};
  let key: string | null = null;

  for (const line of fmLines) {
    // A block-list item under the current key.
    if (/^\s+-\s+/.test(line) && key !== null) {
      const item = stripQuotes(line.replace(/^\s*-\s+/, '').trim());
      if (!Array.isArray(data[key])) data[key] = [];
      (data[key] as string[]).push(item);
      continue;
    }
    // An indented `subkey: value` under the current key → a nested one-level object
    // (`owns:` then `  concepts: [...]`).
    const sub = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (sub && key !== null) {
      const cur = data[key];
      if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) data[key] = {};
      (data[key] as Record<string, string | string[]>)[sub[1]] = parseScalarOrList(sub[2].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const rawVal = kv[2].trim();
    if (rawVal === '') {
      data[key] = null; // may be filled by following `- ` items or `  subkey:` lines
    } else if (rawVal === '{}') {
      data[key] = {};
      key = null;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      data[key] = parseScalarOrList(rawVal);
    } else {
      data[key] = stripQuotes(rawVal);
      key = null; // a scalar cannot be extended by `- `/nested lines
    }
  }
  return { data, body, hadFrontmatter: true };
}

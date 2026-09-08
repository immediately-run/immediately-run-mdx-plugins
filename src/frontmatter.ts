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
// Quoted scalars ARE decoded rather than merely unwrapped, because a quoted scalar's
// escapes are part of that grammar and not an exotic corner of YAML: the corpus's own
// writer emits them (see `DOUBLE_QUOTED_ESCAPES`).
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

/**
 * YAML 1.2 §5.7 escape sequences, as a closed table.
 *
 * A quoted scalar is not its own bytes: the corpus writer emits a backslash before a
 * quote inside a double-quoted title (docs `scripts/lib/wiki.mjs` `emitScalar`), and a
 * reader that only removed the surrounding quotes handed that backslash on to whatever
 * rendered the string. Readers saw it wherever a scalar is printed as plain text — a
 * roadmap card title read `R3-170 — \"Open as wiki / view\" …` — while the entry header
 * for the same item looked right, because the inline-prose parser eats a backslash
 * before ASCII punctuation as a CommonMark escape. Decoding here is what makes those two
 * surfaces agree, and what makes this reader agree with the real YAML parser the
 * compiled path uses (`transpiler/src/mdx/frontmatter.ts`).
 *
 * The `x` / `u` / `U` forms are handled separately, being the only variable-length ones.
 */
const DOUBLE_QUOTED_ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\u0085',
  _: '\u00a0',
  L: '\u2028',
  P: '\u2029',
};

/** How many hex digits each variable-length escape takes after its marker. */
const HEX_ESCAPE_DIGITS: Record<string, number> = { x: 2, u: 4, U: 8 };

/** The code point a `\xXX` / `\uXXXX` / `\UXXXXXXXX` escape names, or null if it is not one. */
function hexEscape(s: string, at: number): { value: string; length: number } | null {
  const digits = HEX_ESCAPE_DIGITS[s[at]];
  if (digits === undefined) return null;
  const raw = s.slice(at + 1, at + 1 + digits);
  if (raw.length !== digits || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  const cp = parseInt(raw, 16);
  if (cp > 0x10ffff) return null;
  return { value: String.fromCodePoint(cp), length: 1 + digits };
}

/** Decode a double-quoted scalar's body (the text between the quotes). */
function unescapeDoubleQuoted(s: string): string {
  if (!s.includes('\\')) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\' || i + 1 >= s.length) {
      out += s[i];
      continue;
    }
    const next = s[i + 1];
    const hex = hexEscape(s, i + 1);
    if (hex) {
      out += hex.value;
      i += hex.length;
    } else if (Object.prototype.hasOwnProperty.call(DOUBLE_QUOTED_ESCAPES, next)) {
      out += DOUBLE_QUOTED_ESCAPES[next];
      i += 1;
    } else {
      // Not an escape YAML defines. A real parser rejects the document; a viewer must
      // not, so both characters stand as written rather than one being eaten silently.
      out += s[i];
    }
  }
  return out;
}

function stripQuotes(s: string): string {
  // Length 2 is the shortest quoted scalar (`""`); without the check a lone `"` would
  // slice to the empty string and a one-character value would vanish.
  if (s.length >= 2) {
    if (s.startsWith('"') && s.endsWith('"')) return unescapeDoubleQuoted(s.slice(1, -1));
    // A single-quoted scalar has exactly one escape: a doubled quote is one quote.
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
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

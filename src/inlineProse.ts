// Inline prose for frontmatter scalar fields (R3-531) — the one parser behind
// every surface that renders `title` / `description` / `scope` as styled text.
//
// WHY IT LIVES HERE. A frontmatter string is markdown (`R3-410 — \`cache.yml\`
// self-provisioning …`), and every list row, card, entry header, search hit and
// sidebar label that drops it into JSX as a plain string prints the backticks in
// the body font. The body path is fine — `renderMdast` maps `inlineCode` to
// `<code>` and compiled MDX does the same — so the fix is one synchronous inline
// parser in the grammar canon, consumed by Grove and its fork, in the same role
// the slug grammar plays for heading ids (R3-277): a regex in each component is
// the drift R3-277 closed.
//
// WHAT IT SUPPORTS, deliberately: code spans (the CommonMark backtick-run rule),
// strong and emphasis (`*`/`_`, including emphasis nested in strong). Nothing
// else is inline prose in a title: no links, no images, no HTML, no JSX — a
// title is not a body (TRUST_MODES_SPEC §5.1 keeps the body grammar in the two
// render standards). Unknown or unbalanced markers are LITERAL text, which is
// also what CommonMark does with an unclosed backtick run. A run of three or
// more `*`/`_` is not strong-or-emphasis here (that would be `***` strong-em,
// which no corpus field uses) and stays literal.
//
// PARITY. `INLINE_PROSE_FIXTURE` (inlineProseFixture.ts) is the published case
// list; grove asserts `parseInlineProse` against the SDK safe renderer's actual
// micromark path over the same cases, so the two cannot drift silently.

/** One inline node of a parsed frontmatter prose string. */
export type InlineProseNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: InlineProseNode[] }
  | { type: 'emphasis'; children: InlineProseNode[] };

const isWhitespace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);
const isAlnum = (ch: string | undefined): boolean => ch !== undefined && /[a-zA-Z0-9]/.test(ch);

/**
 * Split around code spans first (CommonMark: a backtick run closes only on a run
 * of the same length; inner one-space stripping when both edges have a space and
 * the content is not all spaces). A run with no matching closer stays literal
 * text — it flows back into the surrounding segment.
 */
function segmentCodeSpans(s: string): Array<{ kind: 'code' | 'text'; value: string }> {
  const segs: Array<{ kind: 'code' | 'text'; value: string }> = [];
  let textStart = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '`') {
      i++;
      continue;
    }
    const openStart = i;
    while (i < s.length && s[i] === '`') i++;
    const runLen = i - openStart;
    let j = i;
    let closeStart = -1;
    while (j < s.length) {
      if (s[j] === '`') {
        const runStart = j;
        while (j < s.length && s[j] === '`') j++;
        if (j - runStart === runLen) {
          closeStart = runStart;
          break;
        }
      } else {
        j++;
      }
    }
    if (closeStart === -1) continue;
    if (textStart < openStart) segs.push({ kind: 'text', value: s.slice(textStart, openStart) });
    let content = s.slice(i, closeStart);
    if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
      content = content.slice(1, -1);
    }
    segs.push({ kind: 'code', value: content });
    i = closeStart + runLen;
    textStart = i;
  }
  if (textStart < s.length) segs.push({ kind: 'text', value: s.slice(textStart) });
  return segs;
}

/** Merge adjacent text nodes so output shape matches a renderer's text runs. */
function mergeText(nodes: InlineProseNode[]): InlineProseNode[] {
  const merged: InlineProseNode[] = [];
  for (const n of nodes) {
    const last = merged[merged.length - 1];
    if (n.type === 'text' && last?.type === 'text') last.value += n.value;
    else merged.push(n);
  }
  return merged;
}

/**
 * Strong/emphasis over one non-code segment: a delimiter run of length 2 is
 * strong, length 1 is emphasis. Flanking rules, subset form: an opener needs a
 * non-whitespace next char; a closer needs a non-whitespace prev char; `_` adds
 * the CommonMark intraword restriction (no `foo_bar_baz` emphasis). An opener
 * with no matching closer renders as its literal characters.
 */
function parseEmphasis(s: string): InlineProseNode[] {
  const out: InlineProseNode[] = [];
  let litStart = 0;
  let i = 0;

  const canOpen = (pos: number, ch: string, len: number): boolean => {
    const next = s[pos + len];
    if (next === undefined || isWhitespace(next)) return false;
    if (ch === '_' && isAlnum(s[pos - 1])) return false;
    return true;
  };
  const canClose = (pos: number, ch: string, len: number): boolean => {
    const prev = s[pos - 1];
    if (prev === undefined || isWhitespace(prev)) return false;
    if (ch === '_' && isAlnum(s[pos + len])) return false;
    return true;
  };

  while (i < s.length) {
    const ch = s[i];
    if (ch !== '*' && ch !== '_') {
      i++;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] === ch) j++;
    const runLen = j - i;
    if (runLen > 2 || !canOpen(i, ch, runLen)) {
      i = j;
      continue;
    }
    let k = j;
    let closePos = -1;
    while (k < s.length) {
      if (s[k] === ch) {
        const runStart = k;
        while (k < s.length && s[k] === ch) k++;
        if (k - runStart === runLen && canClose(runStart, ch, runLen)) {
          closePos = runStart;
          break;
        }
      } else {
        k++;
      }
    }
    if (closePos === -1) {
      i = j;
      continue;
    }
    if (litStart < i) out.push({ type: 'text', value: s.slice(litStart, i) });
    const inner = parseEmphasis(s.slice(j, closePos));
    out.push(runLen === 2 ? { type: 'strong', children: inner } : { type: 'emphasis', children: inner });
    i = closePos + runLen;
    litStart = i;
  }
  if (litStart < s.length) out.push({ type: 'text', value: s.slice(litStart) });
  return mergeText(out);
}

/**
 * Parse a frontmatter prose string into inline nodes: `` `x` `` → code, `**x**`
 * → strong, `*x*`/`_x_` → emphasis, everything else literal text. Synchronous
 * and dependency-free (the package rule) — a list of two hundred rows parses in
 * one pass each, no whole-document mdast. `''` parses to `[]`; a non-string
 * throws.
 */
export function parseInlineProse(s: string): InlineProseNode[] {
  if (typeof s !== 'string') throw new TypeError('parseInlineProse: expected a string');
  if (s === '') return [];
  const out: InlineProseNode[] = [];
  for (const seg of segmentCodeSpans(s)) {
    if (seg.kind === 'code') out.push({ type: 'code', value: seg.value });
    else out.push(...parseEmphasis(seg.value));
  }
  return mergeText(out);
}

/**
 * The plain form: markers dropped, content kept — `` `x` `` → `x`, `**x**` /
 * `*x*` → `x`, an unbalanced marker kept literally. For every use where the
 * field becomes an attribute, a label, an index key or a prompt string.
 */
export function plainProse(s: string): string {
  const walk = (nodes: InlineProseNode[]): string =>
    nodes
      .map((n) => (n.type === 'strong' || n.type === 'emphasis' ? walk(n.children) : n.value))
      .join('');
  return walk(parseInlineProse(s));
}

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
// WHAT IT SUPPORTS, deliberately: code spans (the CommonMark backtick-run rule)
// and strong/emphasis by the CommonMark delimiter rule, including emphasis
// nested in strong and emphasis spanning a code span (`*a \`b\` c*`). Nothing
// else is inline prose in a title: no links, no images, no HTML, no JSX — a
// title is not a body (TRUST_MODES_SPEC §5.1 keeps the body grammar in the two
// render standards).
//
// THE DELIMITER RULE IS A PORT, NOT A PARAPHRASE. The review gate (R3-531
// round 1) rejected a hand-written flanking approximation: it disagreed with
// the safe renderer on punctuation-adjacent delimiters, non-ASCII intraword
// `_`, and odd-length runs — nine shapes, verified against the real micromark
// path, all latent on today's corpus. What ships now is micromark's attention
// algorithm restated over a token list, so the canon cannot drift from the
// renderer it is parity-bound to:
//
//   • classification per code point — whitespace (`/\s/`), punctuation
//     (`/\p{P}|\p{S}/`), or plain — the same predicates as
//     `micromark-util-character`'s `unicodeWhitespace`/`unicodePunctuation`,
//     with EOF counting as whitespace;
//   • run flags computed as `micromark-core-commonmark`'s `tokenizeAttention`
//     computes `_open`/`_close` (including its marker-adjacent-marker clauses
//     and the `_` intraword restriction);
//   • opener matching as `resolveAllAttention` matches it: nearest same-marker
//     opener that can open, the rule-of-three skip, `use = 2` only when both
//     runs are longer than one, leftover run halves spliced back with their
//     ORIGINAL flags and reprocessed, unmatched runs rendered literally.
//
// PARITY. `INLINE_PROSE_FIXTURE` (inlineProseFixture.ts) is the published case
// list; grove asserts `parseInlineProse` against the SDK safe renderer's actual
// micromark path over the same cases — including every shape this port was
// written to get right — so the two cannot drift silently.

/** One inline node of a parsed frontmatter prose string. */
export type InlineProseNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: InlineProseNode[] }
  | { type: 'emphasis'; children: InlineProseNode[] };

const isWhitespace = (ch: string | undefined): boolean => ch !== undefined && /\s/u.test(ch);
const isPunctuation = (ch: string | undefined): boolean => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

/** micromark's `classifyCharacter`: whitespace(1) · punctuation(2) · plain(undefined); EOF is whitespace. */
function classify(ch: string | undefined): 1 | 2 | undefined {
  if (ch === undefined || isWhitespace(ch)) return 1;
  if (isPunctuation(ch)) return 2;
  return undefined;
}

/** A token of the intermediate list: literal text, a code span, a delimiter run, or a resolved group. */
type Token =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'del'; ch: '*' | '_'; count: number; canOpen: boolean; canClose: boolean }
  | { kind: 'group'; group: InlineProseNode };

/**
 * Scan the string left to right into tokens: code spans close on a backtick run
 * of the same length (one-space edge stripping when both edges have a space and
 * the content is not all spaces; an unclosed run stays text), delimiter runs
 * carry the micromark flags, everything else accumulates as text.
 */
function tokenize(s: string): Token[] {
  const chars = [...s]; // code points, so astral characters classify correctly
  const tokens: Token[] = [];
  let textStart = 0;
  let i = 0;

  const flushText = (end: number) => {
    if (textStart < end) tokens.push({ kind: 'text', value: chars.slice(textStart, end).join('') });
  };

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '`') {
      const openStart = i;
      while (i < chars.length && chars[i] === '`') i++;
      const runLen = i - openStart;
      let j = i;
      let closeStart = -1;
      while (j < chars.length) {
        if (chars[j] === '`') {
          const runStart = j;
          while (j < chars.length && chars[j] === '`') j++;
          if (j - runStart === runLen) {
            closeStart = runStart;
            break;
          }
        } else {
          j++;
        }
      }
      if (closeStart !== -1) {
        flushText(openStart);
        let content = chars.slice(i, closeStart).join('');
        if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
          content = content.slice(1, -1);
        }
        tokens.push({ kind: 'code', value: content });
        i = closeStart + runLen;
        textStart = i;
      }
      // An unclosed run stays literal: it is simply not emitted, so the
      // backticks flow into the surrounding text.
      continue;
    }
    if (ch === '*' || ch === '_') {
      const runStart = i;
      while (i < chars.length && chars[i] === ch) i++;
      flushText(runStart);
      const before = classify(runStart > 0 ? chars[runStart - 1] : undefined);
      const after = classify(i < chars.length ? chars[i] : undefined);
      const beforeRaw = runStart > 0 ? chars[runStart - 1] : undefined;
      const afterRaw = i < chars.length ? chars[i] : undefined;
      const isMarker = (c: string | undefined): boolean => c === '*' || c === '_';
      // micromark `tokenizeAttention`, verbatim: `undefined` means "a plain
      // character this side of the run", `1` is whitespace, `2` punctuation,
      // and a marker adjacent to the run counts as flanking.
      const open = after === undefined || (after === 2 && before !== undefined) || isMarker(afterRaw);
      const close = before === undefined || (before === 2 && after !== undefined) || isMarker(beforeRaw);
      tokens.push({
        kind: 'del',
        ch,
        count: i - runStart,
        canOpen: ch === '*' ? open : open && (before !== undefined || !close),
        canClose: ch === '*' ? close : close && (after !== undefined || !open),
      });
      textStart = i;
      continue;
    }
    i++;
  }
  flushText(chars.length);
  return tokens;
}

/** micromark `resolveAllAttention`, restated over the token list. */
function resolveAttention(tokens: Token[]): Token[] {
  const nodes = [...tokens];
  let c = 0;
  while (c < nodes.length) {
    const closer = nodes[c];
    if (closer.kind !== 'del' || !closer.canClose) {
      c++;
      continue;
    }
    let matched = false;
    // Nearest same-marker opener that can open, with the rule-of-three skip.
    for (let o = c - 1; o >= 0; o--) {
      const opener = nodes[o];
      if (opener.kind !== 'del' || !opener.canOpen || opener.ch !== closer.ch) continue;
      if (
        (opener.canClose || closer.canOpen) &&
        closer.count % 3 !== 0 &&
        (opener.count + closer.count) % 3 === 0
      ) {
        continue;
      }
      // Match. Two markers on each side is strong; one is emphasis.
      const use = opener.count > 1 && closer.count > 1 ? 2 : 1;
      // The content resolves first, exactly as micromark resolves `insideSpan`
      // over the events between opener and closer before wrapping the group.
      const inner = toProse(resolveAttention(nodes.slice(o + 1, c)));
      const group: Token = {
        kind: 'group',
        group: use > 1 ? { type: 'strong', children: inner } : { type: 'emphasis', children: inner },
      };
      const next: Token[] = [];
      // Leftover run halves keep the ORIGINAL run's flags and are reprocessed.
      if (opener.count - use > 0) next.push({ ...opener, count: opener.count - use });
      next.push(group);
      if (closer.count - use > 0) next.push({ ...closer, count: closer.count - use });
      nodes.splice(o, c - o + 1, ...next);
      // Reprocess a leftover closer; otherwise continue past the group.
      c = o + (opener.count - use > 0 ? 1 : 0) + 1;
      matched = true;
      break;
    }
    if (!matched) c++;
  }
  return nodes;
}

/** Groups become nodes; unmatched runs become their literal characters; text runs merge. */
function toProse(tokens: Token[]): InlineProseNode[] {
  const out: InlineProseNode[] = [];
  for (const t of tokens) {
    if (t.kind === 'group') out.push(t.group);
    else if (t.kind === 'text') out.push({ type: 'text', value: t.value });
    else if (t.kind === 'code') out.push({ type: 'code', value: t.value });
    else out.push({ type: 'text', value: t.ch.repeat(t.count) });
  }
  const merged: InlineProseNode[] = [];
  for (const n of out) {
    const last = merged[merged.length - 1];
    if (n.type === 'text' && last?.type === 'text') last.value += n.value;
    else merged.push(n);
  }
  return merged;
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
  return toProse(resolveAttention(tokenize(s)));
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

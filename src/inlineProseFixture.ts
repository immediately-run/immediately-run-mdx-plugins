// The parity fixture for INLINE PROSE in frontmatter fields (R3-531) — the same
// argument as SLUG_PARITY_FIXTURE, one concern over.
//
// Two parties render a frontmatter `title`/`description`/`scope`: this package's
// `parseInlineProse` (the canon — what Grove's lists, cards, headers and search
// hits consume) and the SDK safe renderer's micromark path (what an entry BODY
// gets). They must agree on the supported subset — a code span bolding in one
// surface and printing backticks in the other is the defect R3-531 exists to
// close — and agreement by parallel implementation is a promise, not a
// mechanism. Grove asserts the two against these cases; importing the fixture
// makes drift a failing test in whichever repo moved.
//
// The cases are chosen where the two could plausibly diverge: the backtick-run
// length rule, space stripping, the intraword `_` restriction, space-padded `*`,
// the unbalanced run that stays literal — and, since the R3-531 round-1 review,
// every shape that review proved the first draft wrong on: punctuation-adjacent
// delimiters, non-ASCII intraword `_`, odd-length runs (`**a***`, `***a***`),
// emphasis spanning a code span, and digit-wrapped `*`. Each case's `tokens`
// was transcribed from `parseSafeMdast`'s actual output, not from the spec
// paragraph.

import type { InlineProseNode } from './inlineProse';

/** One prose string and the derivations every consumer must agree on. */
export interface InlineProseCase {
  /** The authored string, verbatim as a frontmatter field carries it. */
  text: string;
  /** What `parseInlineProse` returns — the shape a renderer must produce. */
  tokens: InlineProseNode[];
  /** What `plainProse` returns — markers dropped, content kept. */
  plain: string;
  /** Why this case is in the fixture. */
  why: string;
}

export const INLINE_PROSE_FIXTURE: readonly InlineProseCase[] = [
  {
    text: 'Run `npm test` to check.',
    tokens: [{ type: 'text', value: 'Run ' }, { type: 'code', value: 'npm test' }, { type: 'text', value: ' to check.' }],
    plain: 'Run npm test to check.',
    why: 'the ordinary code span in a title',
  },
  {
    text: 'a ``x ` y`` b',
    tokens: [{ type: 'text', value: 'a ' }, { type: 'code', value: 'x ` y' }, { type: 'text', value: ' b' }],
    plain: 'a x ` y b',
    why: 'a run of two closes only on a run of two; the inner single backtick is content',
  },
  {
    text: 'a `` pad `` b',
    tokens: [{ type: 'text', value: 'a ' }, { type: 'code', value: 'pad' }, { type: 'text', value: ' b' }],
    plain: 'a pad b',
    why: 'one leading and one trailing space are stripped when both are present',
  },
  {
    text: '**Hold** the line.',
    tokens: [{ type: 'strong', children: [{ type: 'text', value: 'Hold' }] }, { type: 'text', value: ' the line.' }],
    plain: 'Hold the line.',
    why: 'strong',
  },
  {
    text: 'Speak *softly*.',
    tokens: [{ type: 'text', value: 'Speak ' }, { type: 'emphasis', children: [{ type: 'text', value: 'softly' }] }, { type: 'text', value: '.' }],
    plain: 'Speak softly.',
    why: 'emphasis with asterisks',
  },
  {
    text: 'Use _underscores_ too.',
    tokens: [{ type: 'text', value: 'Use ' }, { type: 'emphasis', children: [{ type: 'text', value: 'underscores' }] }, { type: 'text', value: ' too.' }],
    plain: 'Use underscores too.',
    why: 'emphasis with underscores',
  },
  {
    text: '**bold and *nested* more**',
    tokens: [
      {
        type: 'strong',
        children: [
          { type: 'text', value: 'bold and ' },
          { type: 'emphasis', children: [{ type: 'text', value: 'nested' }] },
          { type: 'text', value: ' more' },
        ],
      },
    ],
    plain: 'bold and nested more',
    why: 'emphasis nested inside strong — the recursion the flat regex gets wrong',
  },
  {
    text: 'a ` b',
    tokens: [{ type: 'text', value: 'a ` b' }],
    plain: 'a ` b',
    why: 'an unbalanced backtick run is literal text, never an empty code element',
  },
  {
    text: 'foo_bar_baz',
    tokens: [{ type: 'text', value: 'foo_bar_baz' }],
    plain: 'foo_bar_baz',
    why: 'the CommonMark intraword rule: `_` between alphanumerics is not a delimiter',
  },
  {
    text: 'a * b',
    tokens: [{ type: 'text', value: 'a * b' }],
    plain: 'a * b',
    why: 'a space-padded asterisk is neither left- nor right-flanking, so literal',
  },
  {
    text: "a*'foo'*b",
    tokens: [{ type: 'text', value: "a*'foo'*b" }],
    plain: "a*'foo'*b",
    why: 'a delimiter followed by punctuation and preceded by a plain char cannot open (round-1 review, R1)',
  },
  {
    text: 'a*(foo)*b',
    tokens: [{ type: 'text', value: 'a*(foo)*b' }],
    plain: 'a*(foo)*b',
    why: 'same flanking failure with round brackets',
  },
  {
    text: '*(foo)*a',
    tokens: [{ type: 'text', value: '*(foo)*a' }],
    plain: '*(foo)*a',
    why: 'the closer sits between punctuation and a plain char, so it cannot close',
  },
  {
    text: 'x*(y)*z',
    tokens: [{ type: 'text', value: 'x*(y)*z' }],
    plain: 'x*(y)*z',
    why: 'both runs are punctuation-flanked on the plain side only — literal',
  },
  {
    text: 'зима_весна_лето',
    tokens: [{ type: 'text', value: 'зима_весна_лето' }],
    plain: 'зима_весна_лето',
    why: 'the intraword `_` restriction is UNICODE-alphanumeric, not ASCII — a Cyrillic letter blocks the run (round-1 review, R1)',
  },
  {
    text: '**a***',
    tokens: [
      { type: 'strong', children: [{ type: 'text', value: 'a' }] },
      { type: 'text', value: '*' },
    ],
    plain: 'a*',
    why: 'a closer longer than the opener matches two markers and leaves its remainder literal (round-1 review, R1)',
  },
  {
    text: '***a***',
    tokens: [
      {
        type: 'emphasis',
        children: [{ type: 'strong', children: [{ type: 'text', value: 'a' }] }],
      },
    ],
    plain: 'a',
    why: 'the triple runs resolve as emphasis-wrapped strong via the leftover halves (round-1 review, R1)',
  },
  {
    text: '*`a`*',
    tokens: [
      {
        type: 'emphasis',
        children: [{ type: 'code', value: 'a' }],
      },
    ],
    plain: 'a',
    why: 'emphasis SPANS a code span — segmenting code spans before emphasis cannot see this (round-1 review, R1)',
  },
  {
    text: '5*6*7',
    tokens: [
      { type: 'text', value: '5' },
      { type: 'emphasis', children: [{ type: 'text', value: '6' }] },
      { type: 'text', value: '7' },
    ],
    plain: '567',
    why: 'digit-wrapped single asterisks DO emphasize on the real renderer — pinned as measured, not as the spec paragraph was remembered',
  },
  {
    text: '*a `b` c*',
    tokens: [
      {
        type: 'emphasis',
        children: [
          { type: 'text', value: 'a ' },
          { type: 'code', value: 'b' },
          { type: 'text', value: ' c' },
        ],
      },
    ],
    plain: 'a b c',
    why: 'the general emphasis-across-code-span shape the per-segment parser could not build',
  },
  {
    text: '',
    tokens: [],
    plain: '',
    why: 'the empty field',
  },
  {
    text: 'plain prose, no markers.',
    tokens: [{ type: 'text', value: 'plain prose, no markers.' }],
    plain: 'plain prose, no markers.',
    why: 'the no-marker string — the overwhelmingly common case, one text node',
  },
  {
    text: 'R3-410 — `cache.yml` self-provisioning fails on every fresh org repo — widen the deploy-App secrets',
    tokens: [
      { type: 'text', value: 'R3-410 — ' },
      { type: 'code', value: 'cache.yml' },
      { type: 'text', value: ' self-provisioning fails on every fresh org repo — widen the deploy-App secrets' },
    ],
    plain: 'R3-410 — cache.yml self-provisioning fails on every fresh org repo — widen the deploy-App secrets',
    why: 'the REAL title that surfaced the defect, verbatim from content/roadmap/R3-410.mdx',
  },
] as const;

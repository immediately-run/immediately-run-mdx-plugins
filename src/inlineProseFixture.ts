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
// and the unbalanced run that stays literal.

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

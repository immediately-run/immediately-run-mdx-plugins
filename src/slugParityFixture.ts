// The byte-parity fixture for the slug grammar (MARKDOWN_SYNTAX_SPEC §15.1,
// PLATFORM_LAYERING_SPEC §5 / S4, R3-277).
//
// WHY IT IS PUBLISHED RATHER THAN COPIED INTO EACH TEST. Three consumers derive a
// heading id: this package's plugin (the byte-canon, what the compiled and safe
// render paths both emit), Grove's runtime `<Toc>` fallback, and the docs corpus
// checker that audits `§8.9`-style citations resolve to a real anchor. They agreed
// by being written to the same spec paragraph, which is a promise, not a mechanism —
// and the failure mode is silent: a TOC entry that scrolls nowhere, or an audit that
// blesses a dangling deep-link because it computed the id the OTHER way.
//
// Importing one fixture makes disagreement a failing test in whichever repo drifted.
// The cases are chosen where the three could plausibly diverge, not where they
// obviously agree.
//
// Viewer-generic (spec §5.1): nothing here is Grove-shaped. Any viewer that renders
// this MDX subset needs exactly these answers.

/** One heading text and the three derivations every consumer must agree on. */
export interface SlugParityCase {
  /** What a reader would write after the `#`s (inline markup already flattened). */
  text: string;
  /** {@link textSlug} — the GitHub-compatible text slug. */
  slug: string;
  /** {@link sectionId} — the `sec-…` id, or `null` for a prose heading. */
  section: string | null;
  /** {@link headingId} — the heading's canonical id with section ids ENABLED. */
  id: string;
  /** {@link headingId} with `sectionIds: false` — the frontmatter opt-out. */
  idWithoutSections: string;
  /** Why this case is in the fixture. */
  why: string;
}

export const SLUG_PARITY_FIXTURE: readonly SlugParityCase[] = [
  {
    text: 'Getting started',
    slug: 'getting-started',
    section: null,
    id: 'getting-started',
    idWithoutSections: 'getting-started',
    why: 'the ordinary prose heading',
  },
  {
    text: '8. Capability model',
    slug: '8-capability-model',
    section: 'sec-8',
    id: 'sec-8',
    idWithoutSections: '8-capability-model',
    why: 'a whole-number section — the id must NOT be the prose slug',
  },
  {
    text: '8.9 Powerbox',
    slug: '89-powerbox',
    section: 'sec-8-9',
    id: 'sec-8-9',
    idWithoutSections: '89-powerbox',
    why: 'dotted section: dots become hyphens in the id and VANISH from the slug',
  },
  {
    text: '8.9 Renamed entirely',
    slug: '89-renamed-entirely',
    section: 'sec-8-9',
    id: 'sec-8-9',
    idWithoutSections: '89-renamed-entirely',
    why: 'prose-independence: the citation target survives a retitle',
  },
  {
    text: '7A. Filesystem trust mode',
    slug: '7a-filesystem-trust-mode',
    section: 'sec-7a',
    id: 'sec-7a',
    idWithoutSections: '7a-filesystem-trust-mode',
    why: 'letter-suffixed section number',
  },
  {
    text: 'A.0 Branding',
    slug: 'a0-branding',
    section: 'sec-a-0',
    id: 'sec-a-0',
    idWithoutSections: 'a0-branding',
    why: 'appendix form: leading LETTER is section-like only with the dot',
  },
  {
    text: 'Decisions & rejected alternatives',
    slug: 'decisions-rejected-alternatives',
    section: null,
    id: 'decisions-rejected-alternatives',
    idWithoutSections: 'decisions-rejected-alternatives',
    why: '`&` is dropped, and its surrounding spaces do not leave a double hyphen',
  },
  {
    text: 'Résumé — the café case',
    slug: 'rsum-the-caf-case',
    section: null,
    id: 'rsum-the-caf-case',
    idWithoutSections: 'rsum-the-caf-case',
    why:
      'ASCII-only `\\w`: accented letters are DROPPED, not transliterated (`Résumé` → ' +
      '`rsum`), and the em-dash leaves a hyphen run that then COLLAPSES to one. Ugly, and ' +
      'the byte-canon — a consumer that "fixed" either half would silently unlink every ' +
      'citation to such a heading',
  },
  {
    text: '日本語の見出し',
    slug: '',
    section: null,
    id: 'section',
    idWithoutSections: 'section',
    why: 'a fully non-ASCII heading slugs to EMPTY and falls back to `section`',
  },
  {
    text: '?!?',
    slug: '',
    section: null,
    id: 'section',
    idWithoutSections: 'section',
    why: 'punctuation-only heading: same empty-slug fallback, reached a different way',
  },
  {
    text: '  Leading and trailing   spaces  ',
    slug: 'leading-and-trailing-spaces',
    section: null,
    id: 'leading-and-trailing-spaces',
    idWithoutSections: 'leading-and-trailing-spaces',
    why: 'whitespace runs collapse to ONE hyphen; the ends are trimmed',
  },
  {
    text: 'snake_case and kebab-case',
    slug: 'snake_case-and-kebab-case',
    section: null,
    id: 'snake_case-and-kebab-case',
    idWithoutSections: 'snake_case-and-kebab-case',
    why: 'underscore is a word char and SURVIVES; an existing hyphen is kept',
  },
  {
    text: '1a First',
    slug: '1a-first',
    section: 'sec-1a',
    id: 'sec-1a',
    idWithoutSections: '1a-first',
    why: 'digit-then-letter token, no dot — still section-like',
  },
  {
    text: 'v2 roadmap',
    slug: 'v2-roadmap',
    section: 'sec-v2',
    id: 'sec-v2',
    idWithoutSections: 'v2-roadmap',
    why:
      'the grammar is positional, not semantic: `v2` contains a digit in its first ' +
      'component, so it IS section-like. A consumer that special-cased "looks like a ' +
      'version" would diverge here',
  },
  {
    text: '3.2.1 Something',
    slug: '321-something',
    section: 'sec-3-2-1',
    id: 'sec-3-2-1',
    idWithoutSections: '321-something',
    why: 'three dotted components',
  },
] as const;

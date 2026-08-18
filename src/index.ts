// @immediately-run/mdx-plugins — the in-house remark plugins for immediately.run's
// MDX *safe subset*, plus the slug grammar. The SINGLE implementation shared, source
// for source, by the two render standards (TRUST_MODES_SPEC §5 / §5.1, R3-213):
//
//   • the **compiled path** (transpiler `compileMdx` → mdast→hast→JS program→eval),
//     and
//   • the **non-executable safe renderer** (SDK `parseSafeMdast` → direct mdast→React,
//     no evaluator),
//
// so a feature on the shared surface (admonitions, wiki-links, heading/section ids)
// renders identically in both and can never drift. The plugins are pure mdast
// transforms — they hand-walk the tree, carry raw values verbatim, resolve nothing
// against other files (per-file byte-identity, MDX_CONTENT_COLLECTIONS_SPEC §1.1) —
// and have no runtime dependency (the `unified` import is type-only). What differs
// between the two paths is ONLY the micromark extension set and the evaluator, never
// these plugins.

export {
  default as remarkHeadingAnchors,
  textSlug,
  sectionId,
  headingId,
} from './remarkHeadingAnchors';

// R3-277 — the byte-parity fixture every consumer of the slug grammar asserts
// against, so a disagreement is a failing test in whichever repo drifted rather
// than a TOC entry that scrolls nowhere.
export { SLUG_PARITY_FIXTURE } from './slugParityFixture';
export type { SlugParityCase } from './slugParityFixture';
export type { HeadingAnchorOptions } from './remarkHeadingAnchors';

export { default as remarkWikiLinks } from './remarkWikiLinks';

export { default as remarkAdmonitions } from './remarkAdmonitions';

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
export { LINK_SPACE_FIXTURE } from './linkSpaceFixture';
export type { LinkSpaceCase } from './linkSpaceFixture';
export { FS_PREFIX, normalizeAbsolute, resolveLinkTarget } from './linkSpaceCore';
export type { ResolvedLinkTarget, LinkSpace } from './linkSpaceCore';

// R3-277a — the corpus-tooling core: the minimal-YAML frontmatter reader and the
// entry-enumeration rule, each of which had two implementations that agreed only
// because one was a careful port of the other.
export { parseFrontmatter } from './frontmatter';
export type {
  FrontmatterParseResult,
  FrontmatterValue,
  ParsedFrontmatter,
} from './frontmatter';
export { isContentEntryFile, isContentEntryPath } from './corpusEntry';
export type { HeadingAnchorOptions } from './remarkHeadingAnchors';

// R3-531 — inline prose for frontmatter scalar fields: the one synchronous
// parser behind every list row, card, header and search hit that renders a
// `title`/`description`/`scope`, with its published parity fixture.
export { parseInlineProse, plainProse } from './inlineProse';
export type { InlineProseNode } from './inlineProse';
export { INLINE_PROSE_FIXTURE } from './inlineProseFixture';
export type { InlineProseCase } from './inlineProseFixture';

export { default as remarkWikiLinks } from './remarkWikiLinks';

export { default as remarkAdmonitions } from './remarkAdmonitions';


import { Plugin } from 'unified';

interface MdNode$2 {
    type: string;
    value?: string;
    depth?: number;
    children?: MdNode$2[];
    data?: {
        hProperties?: Record<string, unknown>;
        [k: string]: unknown;
    };
    attributes?: MdNode$2[];
    name?: string;
    [key: string]: unknown;
}
interface HeadingAnchorOptions {
    /** `false` ⇒ every heading uses the plain text slug (R3-186 base behavior); no
     *  `sec-` ids and no `data-slug`. Default (undefined/true) ⇒ section-like
     *  headings get `sec-` ids (R3-211). Byte-local: sourced from the file's own
     *  frontmatter. */
    sectionIds?: boolean;
}
/**
 * GitHub-compatible text slug (MARKDOWN_SYNTAX_SPEC §15.1): lower-case, strip
 * anything that is not a word char / space / hyphen, collapse whitespace to single
 * hyphens. Pure function of the string — the whole feature's byte-locality rests on
 * this and the per-file counter never reading another file.
 *
 * `## The **bold** heading` reaches here as the *text content* "The bold heading"
 * (inline markup already flattened by `headingText`), giving `the-bold-heading`.
 */
declare function textSlug(text: string): string;
/**
 * The section id for a heading's text, or `null` when the heading is prose (not
 * section-like). Section-like iff the leading token's first dotted component
 * contains a digit (`8`, `8.9`, `7A`, `1a`) OR the token is an appendix form
 * `^[A-Za-z]\.` (`A.0`). `sec-` + the token lower-cased with dots → hyphens.
 *
 * Prose-independent by construction: `sectionId("8.9 Powerbox") ===
 * sectionId("8.9 Renamed") === "sec-8-9"`, and `sectionId("Decisions …") === null`.
 */
declare function sectionId(text: string): string | null;
/**
 * A heading's canonical id: the section id when the heading is section-like and
 * section ids are enabled, else the GitHub text slug, else `section` — the last
 * because an id has to be a usable anchor target and a heading of only punctuation
 * (or of only non-ASCII text, which `textSlug`'s ASCII `\w` strips entirely) slugs
 * to the empty string.
 *
 * Exported because two other consumers derive this exact value — Grove's `<Toc>`
 * fallback and the docs corpus checker's citation audit — and derived it from three
 * separate transcriptions of the same spec paragraph until R3-277. The plugin below
 * uses it, so the published function and the emitted `id` cannot drift.
 */
declare function headingId(text: string, options?: HeadingAnchorOptions): string;
/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins` after remark-gfm,
 * admonitions and wiki-links. `options.sectionIds === false` forces text-slug ids
 * (the frontmatter opt-out). Walks only top-level `heading` nodes (headings never
 * nest), computes each id from its own text with an in-document duplicate counter,
 * and prepends the `<HeadingAnchor>`.
 */
declare const remarkHeadingAnchors: Plugin<[HeadingAnchorOptions?], MdNode$2>;

/** One heading text and the three derivations every consumer must agree on. */
interface SlugParityCase {
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
declare const SLUG_PARITY_FIXTURE: readonly SlugParityCase[];

/** One raw link target and the resolution every consumer must agree on. */
interface LinkSpaceCase {
    /** The path half of the authored target, verbatim. */
    raw: string;
    /** The absolute path of the file the link was authored in, if known. */
    currentFile?: string;
    /** The enclosing corpus root the consumer declares, `null`/omitted when the
     *  document is not corpus-hosted. */
    corpusRoot?: string | null;
    /** See `LinkSpace.bundleChrooted` (BUNDLE_LAYERS_SPEC §9): `$fs:` collapses
     *  to the scoped root. */
    bundleChrooted?: boolean;
    /** What the SDK's `resolveLinkTarget` returns for these inputs. */
    expect: {
        state: 'resolved';
        path: string;
    } | {
        state: 'unresolvable';
    } | {
        state: 'invalid';
    };
    /** Why this case is in the fixture. */
    why: string;
}
declare const LINK_SPACE_FIXTURE: readonly LinkSpaceCase[];

declare const FS_PREFIX = "$fs:";
interface LinkSpace {
    /** Absolute filesystem path of the enclosing corpus's root (e.g. `/app/content`),
     *  or `null` when the document is not corpus-hosted (default). */
    corpusRoot: string | null;
    /**
     * True when the filesystem this document resolves against is **chroot'd to the
     * bundle** — i.e. the port the app holds was scoped to the bundle's subtree, so
     * the mount root and the bundle root are the same directory
     * (`BUNDLE_LAYERS_SPEC §9`; the `T2`/`T4` wrapper, R3-319 / BL-2).
     *
     * Under that grant `$fs:` **collapses to the scoped root**: `$fs:/p` and `/p`
     * name the same byte, because there is no longer any "mount-absolute" space
     * outside the bundle for `$fs:` to reach into. Without this flag the resolver
     * would hand back a mount-absolute path that the chroot then re-roots anyway —
     * a link that renders as valid and resolves somewhere the author did not mean.
     *
     * **This is an invariant to CREATE, not one to inherit** (`BUNDLE_LAYERS_SPEC
     * §11`): the shipped resolver reads `{currentFile, corpusRoot}` and nothing
     * else, so `$fs:` is bundle-anchored only if something says so. It lives here,
     * in the resolver, rather than as a rule each caller applies by passing
     * `corpusRoot: '/'` — an invariant the arithmetic carries cannot be forgotten
     * at one call site out of five.
     */
    bundleChrooted?: boolean;
}
/** Collapse `.`/`..`/empty segments into a clean absolute path. `..` can never
 *  climb above the root — a (virtual) root's parent is itself, which is what keeps
 *  both the mount space and the corpus space closed under traversal. */
declare const normalizeAbsolute: (path: string) => string;
type ResolvedLinkTarget = 
/** Resolved to an absolute filesystem path (existence NOT checked here). */
{
    state: 'resolved';
    path: string;
}
/** A relative target with no known authoring file — the caller may route
 *  optimistically (it cannot check existence or self-ness generically). */
 | {
    state: 'unresolvable';
}
/** A malformed `$fs:` target (not mount-absolute; includes scheme smuggling).
 *  Callers MUST render this broken/inert — never as an anchor. */
 | {
    state: 'invalid';
};
/**
 * Resolve a raw link target (a wikilink target or an in-app href's path half —
 * fragment already split off) to an absolute filesystem path. THE shared resolver:
 * the default `WikiLink`, the markdown `a` override, and safe-content consumers
 * all route through this one function so the two render pipelines cannot drift.
 */
declare function resolveLinkTarget(raw: string, opts?: {
    currentFile?: string;
    corpusRoot?: string | null;
    /** See `LinkSpace.bundleChrooted`. Under a bundle-chroot'd grant `$fs:`
     *  resolves in the corpus space, because they are the same space. */
    bundleChrooted?: boolean;
}): ResolvedLinkTarget;

/** A parsed frontmatter value: a scalar, a list, one level of nesting, or empty. */
type FrontmatterValue = string | string[] | Record<string, string | string[]> | null;
/** One document's parsed frontmatter block. */
type ParsedFrontmatter = Record<string, FrontmatterValue>;
interface FrontmatterParseResult {
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
 * Split a `--- … ---` frontmatter block off the top of a document.
 *
 * A file without one is not an error — it is an entry with no metadata, and every
 * corpus contains those (a draft, a `_layout.mdx`). This never throws and never
 * discards the body.
 */
declare function parseFrontmatter(content: string): FrontmatterParseResult;

/**
 * Is this file name a corpus ENTRY — a page a reader can navigate to?
 *
 * Two conditions, both structural:
 *
 * - It is `.md` or `.mdx`. Everything else in a corpus (images, JSON, a stray
 *   `.txt`) is an asset, not a page.
 * - Its name does not start with `_`. That prefix marks a **structural** file: the
 *   folder-convention `_layout.mdx` that wraps its siblings at an `<Outlet/>`, and
 *   any future sibling of it. They are part of how the corpus renders, never
 *   something a reader navigates TO — so they are excluded from every enumeration.
 *   Excluding them by prefix rather than by an allow-list of known names is what
 *   makes a NEW structural convention safe to add: it is invisible to enumerations
 *   the day it appears, without every consumer shipping an update first.
 *
 * Takes a file NAME, not a path: callers root it differently (a viewer holds absolute
 * metadata keys under a mount, the tooling holds paths relative to a content dir),
 * and rooting is exactly the part that is legitimately theirs.
 */
declare function isContentEntryFile(fileName: string): boolean;
/**
 * Is this PATH a corpus entry? Convenience over {@link isContentEntryFile} for
 * callers holding a `/`-separated path — it tests the last segment, so a `_`-prefixed
 * DIRECTORY does not exclude the pages inside it (only file names carry the rule).
 */
declare function isContentEntryPath(path: string): boolean;

interface MdNode$1 {
    type: string;
    value?: string;
    children?: MdNode$1[];
    [key: string]: unknown;
}
/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins` after remark-gfm
 * and the admonition plugin; runs on the mdast tree so table cells are already
 * parsed into `text` nodes it can walk.
 */
declare const remarkWikiLinks: Plugin<[], MdNode$1>;

interface MdNode {
    type: string;
    value?: string;
    children?: MdNode[];
    [key: string]: unknown;
}
/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins`; runs on the
 * mdast tree after remark-gfm (whose extensions never touch the alert wrapper).
 */
declare const remarkAdmonitions: Plugin<[], MdNode>;

export { FS_PREFIX, type FrontmatterParseResult, type FrontmatterValue, type HeadingAnchorOptions, LINK_SPACE_FIXTURE, type LinkSpace, type LinkSpaceCase, type ParsedFrontmatter, type ResolvedLinkTarget, SLUG_PARITY_FIXTURE, type SlugParityCase, headingId, isContentEntryFile, isContentEntryPath, normalizeAbsolute, parseFrontmatter, remarkAdmonitions, remarkHeadingAnchors, remarkWikiLinks, resolveLinkTarget, sectionId, textSlug };

// The parity fixture for LINK RESOLUTION (REPO_CONTENT_DISPATCH_SPEC §9,
// PLATFORM_LAYERING_SPEC §5 / S4, R3-277b).
//
// WHY IT IS PUBLISHED RATHER THAN COPIED INTO EACH TEST — the same argument as
// SLUG_PARITY_FIXTURE, one concern over. Three parties resolve a link target:
// the SDK's `resolveLinkTarget` (the canon — `linkSpace.ts`), Grove's runtime
// (`hrefKeyCandidates`/`hrefTargetKey`, which routes rendered `<a>`s and
// wikilinks), and the docs corpus checker (`contentResolve`, which audits that
// authored links name real files). They agreed by being written to the same spec
// decision; this makes agreement a failing test in whichever repo drifted.
//
// The cases are chosen where the parties could plausibly diverge: the two link
// spaces (`$fs:` vs default), traversal clamping, scheme smuggling, and the
// corpus-rooted vs fs-rooted absolute.
//
// Viewer-generic (spec §5.1): nothing here is Grove-shaped — the two spaces are
// the platform's, and any corpus-rendering app needs exactly these answers.
//
// CALLER CONTRACT: cases carry the PATH HALF of a target (the `#fragment` is
// split by every caller before resolving; an anchor-only target never reaches a
// resolver). `expect` is written in the SDK resolver's vocabulary
// (`ResolvedLinkTarget`), so each harness asserts its own outcome equals it.

/** One raw link target and the resolution every consumer must agree on. */
export interface LinkSpaceCase {
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
  expect: { state: 'resolved'; path: string } | { state: 'unresolvable' } | { state: 'invalid' };
  /** Why this case is in the fixture. */
  why: string;
}

export const LINK_SPACE_FIXTURE: readonly LinkSpaceCase[] = [
  {
    raw: 'docs.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/content/docs.mdx' },
    why: 'relative — the form an author actually writes, resolved against the authoring file',
  },
  {
    raw: 'home.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/content/home.mdx' },
    why: 'self — resolution names the authoring file itself; self-ness is the caller’s judgement',
  },
  {
    raw: '../specs/A.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/specs/A.mdx' },
    why: 'relative may leave the corpus — the fs spaces are shared; existence checks decide link fate',
  },
  {
    raw: './sub/../docs.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/content/docs.mdx' },
    why: 'dot segments collapse before anything else',
  },
  {
    raw: '/roadmap/index.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/content/roadmap/index.mdx' },
    why: 'corpus-absolute — anchored at the declared corpus root',
  },
  {
    raw: '/../escape.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/app/content/escape.mdx' },
    why: 'the corpus space is CLOSED under traversal — `..` clamps inside the root, never climbs out',
  },
  {
    raw: '/index.mdx',
    currentFile: '/app/outer/a.mdx',
    corpusRoot: '/app/outer/wiki/nested',
    expect: { state: 'resolved', path: '/app/outer/wiki/nested/index.mdx' },
    why: 'nested corpus — the INNERMOST enclosing root wins (bundle encapsulation)',
  },
  {
    raw: '/src/App.tsx',
    currentFile: '/src/main.tsx',
    corpusRoot: null,
    expect: { state: 'resolved', path: '/src/App.tsx' },
    why: 'a non-corpus app declares nothing: absolute stays fs-rooted, bit-for-bit',
  },
  {
    raw: '$fs:/package.json',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'resolved', path: '/package.json' },
    why: '$fs: — the explicit filesystem space, escaping corpus-relative addressing',
  },
  {
    raw: '$fs:/content/docs.mdx',
    currentFile: '/bundle/content/home.mdx',
    corpusRoot: '/bundle',
    bundleChrooted: true,
    expect: { state: 'resolved', path: '/bundle/content/docs.mdx' },
    why: 'under a bundle chroot $fs: collapses to the scoped root — the two spellings name one space',
  },
  {
    raw: '$fs:javascript:alert(1)',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'invalid' },
    why: 'scheme smuggling through $fs: is INVALID — renders broken, never an anchor',
  },
  {
    raw: '$fs:content/docs.mdx',
    currentFile: '/app/content/home.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'invalid' },
    why: 'a relative $fs: target is malformed — $fs: is mount-absolute or nothing',
  },
  {
    raw: 'docs.mdx',
    corpusRoot: '/app/content',
    expect: { state: 'unresolvable' },
    why: 'relative with no known authoring file — the caller may route optimistically',
  },
];

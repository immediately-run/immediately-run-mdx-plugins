// Which files in a corpus are ENTRIES (PLATFORM_LAYERING_SPEC §5 / S4, R3-277a) —
// fork collapse three of four.
//
// The rule is one line of code and two places it must hold identically: the viewer's
// enumerations (nav, sidebar, search, backlinks, the 404 index) and the corpus
// tooling's (the agent index `llms.txt`, the conformance checker). A file that counts
// as an entry in one and not the other is a page that exists but cannot be found, or
// an index row pointing at a layout wrapper.

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
export function isContentEntryFile(fileName: string): boolean {
  if (!/\.mdx?$/.test(fileName)) return false;
  return !fileName.startsWith('_');
}

/**
 * Is this PATH a corpus entry? Convenience over {@link isContentEntryFile} for
 * callers holding a `/`-separated path — it tests the last segment, so a `_`-prefixed
 * DIRECTORY does not exclude the pages inside it (only file names carry the rule).
 */
export function isContentEntryPath(path: string): boolean {
  return isContentEntryFile(path.split('/').pop() ?? '');
}

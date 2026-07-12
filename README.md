# @immediately-run/mdx-plugins

immediately.run's in-house **remark plugins for the MDX safe subset** — admonitions
(`MARKDOWN_SYNTAX_SPEC §12`), wiki-links (`§13`), and heading / section-id anchors
(`§15`, R3-186 + R3-211) — plus the slug grammar (`textSlug` / `sectionId`).

This is the **single source of truth** shared, source for source, between immediately.run's
two MDX render standards (`TRUST_MODES_SPEC §5` / `§5.1`, R3-213):

- the **compiled path** — the transpiler's `compileMdx` (mdast → hast → JS program → eval),
  used for an app's own trusted source; and
- the **non-executable safe renderer** — the SDK's `parseSafeMdast` (a direct mdast → React
  walk with **no evaluator**), used to render low-trust / multi-author content (a wiki, a
  shared space) as **data**.

Because both paths run the **same** plugins, a feature on the shared surface (an admonition,
a wiki-link, a section-id deep-link target) renders identically in both and can never drift.
What differs between the standards is only the micromark extension set and the presence of
an evaluator — never these plugins.

## Why a separate package

The plugins are pure **mdast transforms** — they hand-walk the tree, carry raw values
verbatim, and resolve nothing against other files (per-file byte-identity,
`MDX_CONTENT_COLLECTIONS_SPEC §1.1`). They have **no runtime dependency** (the `unified`
import is type-only). Extracting them here lets the SDK's safe renderer consume the *same
source* as the transpiler without pulling the heavy `@babel/standalone` / `@mdx-js/mdx`
graph into every app that only renders safe content.

## API

```ts
import {
  remarkHeadingAnchors, // (opts?: { sectionIds?: boolean }) => transformer
  remarkWikiLinks,       // () => transformer
  remarkAdmonitions,     // () => transformer
  textSlug,              // (text) => GitHub-compatible slug
  sectionId,             // (text) => 'sec-8-9' | null (prose-independent)
} from '@immediately-run/mdx-plugins';
```

Consumers: the `@immediately-run/transpiler` compile chain and the `@immediately-run/sdk`
safe renderer. See `TRUST_MODES_SPEC §5.1` for the two-standards model.

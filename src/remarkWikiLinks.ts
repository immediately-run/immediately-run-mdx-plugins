import type { Plugin } from 'unified';

// WikiLinks (`[[target]]` / `[[label|target]]`) → `<WikiLink target="…" label="…">`
// (MARKDOWN_SYNTAX_SPEC §13). A small in-house remark plugin (the R3-152 pattern),
// loaded after remark-gfm. It carries the RAW target and label **verbatim** and
// resolves NOTHING against other files — so a file's compiled output depends only
// on its own bytes (the load-bearing byte-identity invariant; compile-time
// resolution was rejected — §13.2 Decisions). Existence and the `resolved | broken
// | self` state — including resolving a RELATIVE target against the current file's
// directory — are RENDER concerns handled by the SDK's default `<WikiLink>`, which
// learns the authoring file from the ambient `<Include>` render context
// (`RenderExportedComponentContext` → `evaluation.module.filepath`), §13.2/§13.3.
//
// The transform hand-walks the mdast tree (no `unist-util-visit`, no ESM-only dep)
// and rewrites `[[…]]` runs inside `text` nodes into inline `mdxJsxTextElement`
// nodes, which the downstream remark-mdx pipeline compiles to JSX. It is purely
// local to each file (depends on no other file), so per-file byte-identity and
// pre-transpile caching are preserved (MDX_CONTENT_COLLECTIONS_SPEC §1.1).
//
// `|` vs GFM tables (§13.4): the pipe in `[[label|target]]` collides with the
// table cell delimiter at the micromark (syntax) level, which runs BEFORE any
// remark plugin. Inside a table the author escapes it (`[[label\|target]]`, the
// standard GFM literal-pipe escape); by the time this plugin runs the cell text is
// a plain `[[label|target]]` again, so the transform is identical in and out of a
// table.

// Inner content matches up to the closing `]]`, forbidding `[`/`]` so nested
// brackets can't be swallowed. A global regex — a text node can hold several.
const WIKILINK = /\[\[([^[\]]+)\]\]/g;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

/**
 * Build a `<WikiLink>` node from the inner text of a `[[…]]`, or `null` if it is
 * not a usable wiki-link (empty target) — in which case the literal `[[…]]` is
 * left untouched. Format is `[[label|target]]` (label first, target second — a
 * deliberate departure from Obsidian, §13.1); `[[target]]` has no explicit label
 * (the component derives a basename label). Label/target are trimmed of the
 * whitespace an author leaves around the `|`. The kernel resolves NOTHING:
 * `target`/`label` are carried verbatim; the component resolves at render.
 */
function toWikiLink(inner: string): MdNode | null {
  const pipe = inner.indexOf('|');
  let target: string;
  let label: string | undefined;
  if (pipe === -1) {
    target = inner.trim();
  } else {
    label = inner.slice(0, pipe).trim();
    target = inner.slice(pipe + 1).trim();
  }
  if (target === '') return null;

  const attributes: MdNode[] = [
    { type: 'mdxJsxAttribute', name: 'target', value: target },
  ];
  if (label) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'label', value: label });
  }
  return {
    type: 'mdxJsxTextElement', // inline (phrasing) — a wiki-link sits in a paragraph
    name: 'WikiLink',
    attributes,
    children: [],
  };
}

/**
 * Split one `text` node on its `[[…]]` runs, returning the replacement node list,
 * or `null` when the node has no usable wiki-link (leave it byte-for-byte as is —
 * critical for the byte-identity of ordinary content).
 */
function splitTextNode(node: MdNode): MdNode[] | null {
  const value = node.value;
  if (typeof value !== 'string' || value.indexOf('[[') === -1) return null;

  const out: MdNode[] = [];
  let lastIndex = 0;
  let produced = false;
  WIKILINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK.exec(value)) !== null) {
    const wl = toWikiLink(match[1]);
    if (!wl) continue; // empty target → keep the literal `[[…]]` in the trailing text
    if (match.index > lastIndex) {
      out.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }
    out.push(wl);
    lastIndex = match.index + match[0].length;
    produced = true;
  }
  if (!produced) return null;
  if (lastIndex < value.length) {
    out.push({ type: 'text', value: value.slice(lastIndex) });
  }
  return out;
}

/** Depth-first walk, splitting `[[…]]` out of `text` nodes in place. */
function walk(node: MdNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'text') {
      const replacement = splitTextNode(child);
      if (replacement) {
        children.splice(i, 1, ...replacement);
        i += replacement.length - 1; // skip the freshly-inserted nodes
      }
      continue;
    }
    walk(child);
  }
}

/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins` after remark-gfm
 * and the admonition plugin; runs on the mdast tree so table cells are already
 * parsed into `text` nodes it can walk.
 */
const remarkWikiLinks: Plugin<[], MdNode> = () => (tree) => {
  walk(tree as MdNode);
};

export default remarkWikiLinks;

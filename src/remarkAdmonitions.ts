import type { Plugin } from 'unified';

// GitHub-style admonitions (`> [!NOTE]`) → `<Admonition type="note">…</Admonition>`
// (MARKDOWN_SYNTAX_SPEC §12). A small in-house remark plugin — NOT a third-party
// package (spec Decisions, signed off 2026-07-02) — so it carries no ESM-only
// dependency of its own and rides the existing `@mdx-js/mdx` load. It hand-walks
// the mdast tree (no `unist-util-visit`) and rewrites a matching blockquote into
// an `mdxJsxFlowElement` — emitting the component form directly, which the
// downstream remark-mdx pipeline compiles to JSX. The transform is PURELY LOCAL
// to each file (depends on no other file), so per-file byte-identity and
// pre-transpile caching are preserved (MDX_CONTENT_COLLECTIONS_SPEC §1.1).

// The five GitHub alert types. Matched case-insensitively (GitHub's cmark-gfm
// alert extension is case-insensitive; the spec defers to "case per GitHub"), and
// the emitted `type` attribute is always lower-case to match the SDK's
// `AdmonitionType` union (`note | tip | important | warning | caution`).
const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\r?\n|$)/i;

// Minimal structural typing for the mdast nodes we touch — the package does not
// depend on `@types/mdast`, and the transform only reads `type`/`children` and a
// leading text node's `value`.
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

/**
 * Try to rewrite one `blockquote` into an `Admonition` element. Returns the new
 * node, or `null` if the blockquote is not an admonition (leave it untouched).
 *
 * A blockquote is an admonition iff its first child is a paragraph whose first
 * inline child is a text node beginning with a `[!TYPE]` marker that occupies its
 * own line — i.e. the marker is followed by a line break, or it is the sole
 * content of the blockquote. `> [!NOTE] inline` (marker not alone on the line)
 * stays an ordinary blockquote, matching GitHub.
 */
function toAdmonition(blockquote: MdNode): MdNode | null {
  const firstBlock = blockquote.children?.[0];
  if (!firstBlock || firstBlock.type !== 'paragraph') return null;

  const inlines = firstBlock.children;
  const firstInline = inlines?.[0];
  if (!firstInline || firstInline.type !== 'text' || typeof firstInline.value !== 'string') {
    return null;
  }

  const match = MARKER.exec(firstInline.value);
  if (!match) return null;

  // `$`-only match (no newline) means the marker ran to the end of this text
  // node. That is a real marker line ONLY if nothing else shares the line —
  // i.e. the text node is the paragraph's sole inline child. Otherwise the
  // marker is followed by inline content on the same line → not an admonition.
  const consumedNewline = match[2] !== '';
  if (!consumedNewline && (inlines?.length ?? 0) > 1) return null;

  const type = match[1].toLowerCase();

  // Strip the marker (and its trailing line break) from the leading text node.
  const rest = firstInline.value.slice(match[0].length);
  if (rest.length === 0) {
    inlines!.shift();
    // A marker-only blockquote leaves an empty leading paragraph — drop it so
    // `> [!NOTE]` with no body yields `<Admonition type="note" />`, not one
    // wrapping a stray empty paragraph.
    if (inlines!.length === 0) blockquote.children!.shift();
  } else {
    firstInline.value = rest;
  }

  return {
    type: 'mdxJsxFlowElement',
    name: 'Admonition',
    attributes: [{ type: 'mdxJsxAttribute', name: 'type', value: type }],
    children: blockquote.children ?? [],
  };
}

/** Depth-first walk, replacing admonition blockquotes in place. */
function walk(node: MdNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'blockquote') {
      const converted = toAdmonition(child);
      if (converted) {
        children[i] = converted;
        walk(converted); // handle nested blockquotes/admonitions in the body
        continue;
      }
    }
    walk(child);
  }
}

/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins`; runs on the
 * mdast tree after remark-gfm (whose extensions never touch the alert wrapper).
 */
const remarkAdmonitions: Plugin<[], MdNode> = () => (tree) => {
  walk(tree as MdNode);
};

export default remarkAdmonitions;

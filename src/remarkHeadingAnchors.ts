import type { Plugin } from 'unified';

// Heading slugs + autolink anchors (MARKDOWN_SYNTAX_SPEC §15, R3-186; the §15.1
// section-id amendment is R3-211). A small in-house remark plugin (the R3-152/153
// pattern), loaded after remark-gfm. For EVERY heading it (a) computes a byte-local
// `id` and sets it via `data.hProperties.id`, and (b) prepends an autolink anchor
// as an `mdxJsxTextElement` `<HeadingAnchor>` pointing at `#<id>`. It reads only
// the heading's own text (and the file's own frontmatter flag), never any other
// file, so per-file byte-identity and pre-transpile caching are preserved
// (MDX_CONTENT_COLLECTIONS_SPEC §1.1).
//
// Two id schemes (R3-211 §15.1), chosen per heading:
//   - **section-like heading** — its leading token `T` is a section number
//     (`## 8.9 Powerbox`, `## 7A. …`, `## A.0 …`): the `id` IS the *section id*
//     `sec-8-9` / `sec-7a` / `sec-a-0` (prose-independent, the stable citation
//     target — an agent computes `#sec-8-9` from `§8.9` with zero lookup), and the
//     GitHub text slug is demoted to a `data-slug` attribute (a fallback hook).
//   - **prose heading** — the `id` is the GitHub-compatible text slug
//     (`## Getting started` → `getting-started`).
// A file opts the whole thing back to plain text-slug ids with a `sectionIds:false`
// frontmatter flag (threaded in as the plugin option; default on). A heading that
// already carries an author-set `id` (JSX `<h2 id="x">`) is never overwritten and
// gets no second anchor.
//
// The transform hand-walks the mdast (no `unist-util-visit`, no ESM-only dep) so it
// rides the existing `loadMdxDeps` load and adds no dependency, exactly as §12.2 /
// §13.2 do. It runs on the `heading` nodes remark-gfm produced.

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown>; [k: string]: unknown };
  attributes?: MdNode[];
  name?: string;
  [key: string]: unknown;
}

export interface HeadingAnchorOptions {
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
export function textSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop non-word (keep spaces + hyphens)
    .replace(/\s+/g, '-') // whitespace runs → single hyphen
    .replace(/-+/g, '-') // collapse hyphen runs
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

// The leading token: the run of alphanumerics-and-dots before the first
// space / em-dash / colon (R3-211 grammar, plan 01-deep-linking §3.1).
const LEADING_TOKEN = /^([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/;

/**
 * The section id for a heading's text, or `null` when the heading is prose (not
 * section-like). Section-like iff the leading token's first dotted component
 * contains a digit (`8`, `8.9`, `7A`, `1a`) OR the token is an appendix form
 * `^[A-Za-z]\.` (`A.0`). `sec-` + the token lower-cased with dots → hyphens.
 *
 * Prose-independent by construction: `sectionId("8.9 Powerbox") ===
 * sectionId("8.9 Renamed") === "sec-8-9"`, and `sectionId("Decisions …") === null`.
 */
export function sectionId(text: string): string | null {
  const m = text.trim().match(LEADING_TOKEN);
  if (!m) return null;
  const token = m[1];
  const firstComponent = token.split('.')[0];
  const sectionLike = /\d/.test(firstComponent) || /^[A-Za-z]\./.test(token);
  if (!sectionLike) return null;
  return 'sec-' + token.toLowerCase().replace(/\./g, '-');
}

/**
 * Flatten a heading's inline children to plain text — the input to the slug. Text
 * and inline-code contribute their literal value; everything else (emphasis,
 * links, strong) contributes its own flattened children, so `**bold**` and
 * `` `code` `` become their text. An already-injected `HeadingAnchor` (this plugin
 * is idempotent-safe) and other JSX contribute nothing.
 */
function headingText(node: MdNode): string {
  let out = '';
  const visit = (n: MdNode): void => {
    if (n.type === 'text' || n.type === 'inlineCode') {
      out += n.value ?? '';
      return;
    }
    if (n.type === 'mdxJsxTextElement' || n.type === 'mdxTextExpression') return;
    if (Array.isArray(n.children)) n.children.forEach(visit);
  };
  if (Array.isArray(node.children)) node.children.forEach(visit);
  return out;
}

/** Whether the heading already carries an author-set `id` (via `hProperties`, an
 *  earlier plugin, or a hand-authored JSX heading) — leave those untouched. */
function hasAuthorId(node: MdNode): boolean {
  const id = node.data?.hProperties?.id;
  return typeof id === 'string' && id.length > 0;
}

function anchorNode(id: string): MdNode {
  return {
    type: 'mdxJsxTextElement',
    name: 'HeadingAnchor',
    attributes: [{ type: 'mdxJsxAttribute', name: 'id', value: id }],
    children: [],
  };
}

/**
 * Remark plugin factory. Added to `compile.ts`'s `remarkPlugins` after remark-gfm,
 * admonitions and wiki-links. `options.sectionIds === false` forces text-slug ids
 * (the frontmatter opt-out). Walks only top-level `heading` nodes (headings never
 * nest), computes each id from its own text with an in-document duplicate counter,
 * and prepends the `<HeadingAnchor>`.
 */
const remarkHeadingAnchors: Plugin<[HeadingAnchorOptions?], MdNode> =
  (options = {}) =>
  (tree) => {
    const sectionEnabled = options.sectionIds !== false;
    const seen = new Map<string, number>(); // base id → count, for -1/-2 suffixing
    const root = tree as MdNode;
    const children = root.children;
    if (!Array.isArray(children)) return;

    for (const node of children) {
      if (node.type !== 'heading') continue;
      if (hasAuthorId(node)) continue; // never overwrite / double-anchor

      const text = headingText(node);
      const slug = textSlug(text);
      const sec = sectionEnabled ? sectionId(text) : null;

      // The heading's own canonical id: the section id when section-like (+ opt-in),
      // else the text slug. An empty slug (heading of only punctuation) falls back
      // to "section" so the id is always a valid anchor target.
      let baseId = sec ?? slug ?? '';
      if (baseId === '') baseId = 'section';

      // In-document de-dup: byte-local (only this file's heading sequence).
      const n = seen.get(baseId) ?? 0;
      seen.set(baseId, n + 1);
      const id = n === 0 ? baseId : `${baseId}-${n}`;

      const hProperties = (node.data ??= {}).hProperties ?? (node.data.hProperties = {});
      hProperties.id = id;
      // Demote the GitHub text slug to a fallback hook on a section-like heading
      // (R3-211): the id is the section id, `data-slug` keeps the prose slug.
      if (sec && slug && slug !== id) hProperties['data-slug'] = slug;

      // Prepend the autolink anchor pointing at this heading's own id.
      node.children = [anchorNode(id), ...(node.children ?? [])];
    }
  };

export default remarkHeadingAnchors;

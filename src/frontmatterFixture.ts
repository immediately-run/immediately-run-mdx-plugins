// The frontmatter parity fixture (PLATFORM_LAYERING_SPEC §5 / S4, R3-1347).
//
// WHY IT IS PUBLISHED. The host's metadata scan (the transpiler) and every other corpus
// reader (Grove under dispatch, the docs checker, kanban) must read a block the same way.
// They do by construction — the transpiler delegates to `parseFrontmatter` here (R3-1348) —
// and this fixture is how each consumer PROVES it calls the same function rather than
// trusting it: run every case through the parser you actually ship, compare with
// `expected`. A copied parser, a second YAML library or a stale pin fails here.
//
// It is exported from `@immediately-run/mdx-plugins/frontmatter`, beside the parser.
//
// HOW IT IS BUILT. The inputs are data, in `frontmatterFixture.cases.json`: one case per
// input SHAPE (typed scalars, lists, lists of maps, deep nesting, flow maps, multi-line
// scalars, comments, the fence variants, explicit tags, and the errors), two of them real files cut to
// their frontmatter. Each declares the exact YAML its fences enclose. The expectations,
// in `frontmatterFixture.expected.json`, are generated from those blocks by `yaml.parse`
// itself (`scripts/gen-frontmatter-fixture.mjs`) and frozen — never typed by hand.
import CASES from './frontmatterFixture.cases.json';
import EXPECTED from './frontmatterFixture.expected.json';
import type { FrontmatterError, ParsedFrontmatter } from './frontmatter';

/** One input and what `parseFrontmatter` must make of it. */
export interface FrontmatterCase {
  /** A unique, stable name — the shape it stands for. */
  name: string;
  /** Why this case is in the fixture. */
  why: string;
  /** The whole document, exactly as a file would hold it. */
  source: string;
  /** The YAML text between its fences, or `null` when it has no frontmatter. */
  block: string | null;
  expected: {
    data: ParsedFrontmatter;
    hadFrontmatter: boolean;
    /** Set when the block is present but yields no data. */
    errorKind?: FrontmatterError['kind'];
  };
}

const expectedByName = EXPECTED as Record<string, FrontmatterCase['expected']>;

export const FRONTMATTER_PARITY_FIXTURE: readonly FrontmatterCase[] = (
  CASES as Array<Omit<FrontmatterCase, 'expected'>>
).map((c) => {
  const expected = expectedByName[c.name];
  // Loud, at import: a case without an expectation means the generator was not re-run.
  if (!expected) throw new Error(`frontmatter fixture: no expectation for case "${c.name}"`);
  return { ...c, expected };
});

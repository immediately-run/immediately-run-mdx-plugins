// R3-277a — the corpus-tooling core: the frontmatter reader and the entry rule.
//
// These cases are the GRAMMAR, stated where the implementation now lives. Since R3-1347
// the grammar is YAML 1.2 (the `yaml` package, no options — what the host has always
// run); `test/frontmatter.test.mjs` runs the published fixture, and the docs repo
// replays its corpus against a frozen golden — a unit test can only cover the shapes
// someone thought of, and a corpus is the set nobody did.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isContentEntryFile, isContentEntryPath } from '../dist/index.js';
import { parseFrontmatter } from '../dist/frontmatter.js';

test('parses scalars, flow lists, block lists and one level of nesting', () => {
  const src = [
    '---',
    'title: A doc',
    'tags: [a, b]',
    'repos:',
    '  - sdk',
    '  - sandbox',
    'owns:',
    '  concepts: [x, y]',
    '---',
    '',
    'body text',
  ].join('\n');
  const { data, body, hadFrontmatter } = parseFrontmatter(src);
  assert.equal(hadFrontmatter, true);
  assert.equal(data.title, 'A doc');
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.deepEqual(data.repos, ['sdk', 'sandbox']);
  assert.deepEqual(data.owns, { concepts: ['x', 'y'] });
  assert.equal(body, 'body text');
});

test('strips quotes from a fully-quoted scalar, and keeps inner punctuation', () => {
  const { data } = parseFrontmatter('---\ntitle: "R3-1: a title, with commas"\n---\n');
  assert.equal(data.title, 'R3-1: a title, with commas');
});

test('`{}` is an empty object, a bare key is null, and neither swallows the next key', () => {
  // `owns: {}` is the corpus's "declares nothing" and must not absorb `topics:`.
  const { data } = parseFrontmatter('---\nowns: {}\ntopics:\n  - a\nid: x\n---\n');
  assert.deepEqual(data.owns, {});
  assert.deepEqual(data.topics, ['a']);
  assert.equal(data.id, 'x');
});

test('a document with no frontmatter keeps its whole body — never an error', () => {
  const src = '# Just a heading\n\ntext';
  const r = parseFrontmatter(src);
  assert.deepEqual(r.data, {});
  assert.equal(r.body, src);
  assert.equal(r.hadFrontmatter, false);
});

test('an UNCLOSED block is "no frontmatter", not a truncated parse', () => {
  // The distinction a rewriting tool needs: this file has no block to replace, and
  // treating it as one would append a second `---` and corrupt the document.
  const src = '---\ntitle: never closed\n\nbody';
  const r = parseFrontmatter(src);
  assert.equal(r.hadFrontmatter, false);
  assert.equal(r.body, src);
});

test('an EMPTY block is frontmatter with no keys — not the same as having none', () => {
  const r = parseFrontmatter('---\n---\n\nbody');
  assert.equal(r.hadFrontmatter, true);
  assert.deepEqual(r.data, {});
});

test('the entry rule: extension in, `_`-prefix out', () => {
  assert.equal(isContentEntryFile('post.mdx'), true);
  assert.equal(isContentEntryFile('post.md'), true);
  assert.equal(isContentEntryFile('_layout.mdx'), false);
  assert.equal(isContentEntryFile('_anything-future.mdx'), false);
  assert.equal(isContentEntryFile('diagram.svg'), false);
  assert.equal(isContentEntryFile('notes.txt'), false);
});

test('the path form tests the FILE name only — a `_`-prefixed directory is not a filter', () => {
  assert.equal(isContentEntryPath('specs/_layout.mdx'), false);
  assert.equal(isContentEntryPath('specs/UI_AS_APPS_SPEC.mdx'), true);
  // A directory named `_drafts` does not hide its pages: only file names carry the
  // rule, and a consumer that wants to skip a subtree does that by path, deliberately.
  assert.equal(isContentEntryPath('_drafts/post.mdx'), true);
});

// ── Quoted-scalar escapes ────────────────────────────────────────────────────────
//
// The reader and the corpus's own WRITER are two halves of one round trip: docs
// `scripts/lib/wiki.mjs` `emitScalar` quotes a scalar that needs it and escapes the
// quotes inside it, so a title it wrote comes back through here. Before this the
// backslash survived into the rendered string and readers saw it on every surface that
// prints a scalar as plain text (a roadmap card title), but not on the ones that treat
// it as markdown (an entry header), because CommonMark eats a backslash before ASCII
// punctuation. Same file, two spellings of its own title.

test('a double-quoted scalar decodes its escapes, not just its delimiters', () => {
  const src = '---\ntitle: "R3-170 — \\"Open as wiki / view\\" affordance"\n---\n';
  const { data } = parseFrontmatter(src);
  assert.equal(data.title, 'R3-170 — "Open as wiki / view" affordance');
});

test('every escape YAML 1.2 §5.7 defines decodes to its character', () => {
  // The class the code enumerates, enumerated: a favourite member (`\\"`) would prove
  // only that member, and `\\\\` in particular is what keeps a decoded backslash from
  // being re-read as the start of the next escape.
  const cases = [
    ['\\0', '\u0000'], ['\\a', '\u0007'], ['\\b', '\b'], ['\\t', '\t'],
    ['\\n', '\n'], ['\\v', '\v'], ['\\f', '\f'], ['\\r', '\r'],
    ['\\e', '\u001b'], ['\\ ', ' '], ['\\"', '"'], ['\\/', '/'],
    ['\\\\', '\\'], ['\\N', '\u0085'], ['\\_', '\u00a0'],
    ['\\L', '\u2028'], ['\\P', '\u2029'],
    ['\\x41', 'A'], ['\\u00e9', 'é'], ['\\U0001F600', '\u{1F600}'],
  ];
  for (const [escape, want] of cases) {
    const { data } = parseFrontmatter(`---\ntitle: "a${escape}b"\n---\n`);
    assert.equal(data.title, `a${want}b`, `\`${escape}\` should decode`);
  }
});

test('an escape YAML rejects is an error the reader reports — never a half-read block', () => {
  // R3-1347: the host's parser rejects these documents, so this one does too. It may not
  // throw (a viewer must not blank the page): the block yields no data and says where.
  // The subset reader let both characters stand, which is a value the host never had.
  for (const src of [
    '---\ntitle: "a\\qb"\n---\n', // not an escape
    '---\ntitle: "a\\x4"\n---\n', // truncated hex form
    '---\nid: "\\U00110000"\n---\n', // past the Unicode range
  ]) {
    const r = parseFrontmatter(src);
    assert.deepEqual(r.data, {}, src);
    assert.equal(r.hadFrontmatter, true, src);
    assert.equal(r.error?.kind, 'yaml', src);
    assert.equal(r.error?.line, 2, `${src} — the value's line, counting the opening fence`);
  }
});

test('a single-quoted scalar has exactly one escape: a doubled quote', () => {
  const { data } = parseFrontmatter("---\ntitle: 'it''s a \\n literal'\n---\n");
  assert.equal(data.title, "it's a \\n literal");
});

test('escapes decode inside list items too, block and flow alike', () => {
  const { data } = parseFrontmatter(
    '---\ntopics: ["a\\"b"]\nrepos:\n  - "c\\"d"\nowns:\n  concepts: ["e\\"f"]\n---\n',
  );
  assert.deepEqual(data.topics, ['a"b']);
  assert.deepEqual(data.repos, ['c"d']);
  assert.deepEqual(data.owns, { concepts: ['e"f'] });
});

test('an unterminated quote is an error; an empty quoted string is the empty string', () => {
  // R3-1347: `title: "` opens a quoted scalar that never closes. The subset reader kept
  // the lone quote as the value; YAML (and so the host) rejects the block.
  for (const src of ['---\ntitle: "\n---\n', "---\ntitle: '\n---\n"]) {
    const r = parseFrontmatter(src);
    assert.deepEqual(r.data, {}, src);
    assert.equal(r.error?.kind, 'yaml', src);
  }
  const ok = parseFrontmatter('---\ntitle: ""\n---\n');
  assert.equal(ok.data.title, '');
  assert.equal(ok.error, undefined);
});

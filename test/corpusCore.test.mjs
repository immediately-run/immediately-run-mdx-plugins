// R3-277a — the corpus-tooling core: the frontmatter reader and the entry rule.
//
// These cases are the GRAMMAR, stated where the implementation now lives. The
// consumers' own suites assert the same behaviour through their imports, and the docs
// repo additionally replays the entire 706-file corpus against a golden captured from
// the parser this one replaced — a unit test can only cover the shapes someone thought
// of, and a corpus is the set nobody did.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, isContentEntryFile, isContentEntryPath } from '../dist/index.js';

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

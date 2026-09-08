// Quoted-scalar escapes: this reader against the REAL YAML parser (`yaml@2.7.1`), the
// one the compiled path runs (`transpiler/src/mdx/frontmatter.ts`).
//
// The reason this file exists rather than a frozen table of expected strings: the whole
// claim `parseFrontmatter` makes is that a corpus reads the same under dispatch (this
// minimal reader) as under the bundler (that full parser). A table would assert what
// someone believed on the day they typed it. This asserts the agreement itself, and it
// found its first customer immediately — greptile flagged `\uD800` as a code point to
// reject, which would have made a title read `a\uD800b` here and `a<surrogate>b` on the
// compiled path: a divergence introduced in the name of validation.
//
// The escape class is DERIVED, not hand-listed: every printable-ASCII character is tried
// as the escape marker, and `yaml` itself sorts them into the two branches. So a table
// entry added or dropped here cannot pass unnoticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

import { parseFrontmatter } from '../dist/index.js';

/** What each parser makes of `title: "a<body>b"` — a string, or the fact that it threw. */
function both(body) {
  const line = `title: "a${body}b"`;
  let real;
  try {
    real = { ok: true, value: parse(line).title };
  } catch {
    // A real parser rejects the document. This reader may not: a corpus is a foreign
    // author's tree read at runtime, and one malformed entry may not blank the wiki.
    real = { ok: false };
  }
  return { real, mine: parseFrontmatter(`---\n${line}\n---\n`).data.title, raw: `a${body}b` };
}

test('every escape the real parser accepts decodes to the same character here', () => {
  // The single-character escape space, swept rather than transcribed: `\` + each
  // printable ASCII character, plus the tab form YAML also admits.
  const markers = ['\t'];
  for (let c = 0x20; c <= 0x7e; c++) markers.push(String.fromCharCode(c));

  const agreed = [];
  const rejected = [];
  for (const m of markers) {
    const { real, mine, raw } = both(`\\${m}`);
    if (real.ok) {
      assert.equal(mine, real.value, `\`\\${m}\` must decode as yaml decodes it`);
      agreed.push(m);
    } else {
      // The documented degradation: both characters stand as written, so the author's
      // text is never silently rewritten and the page still renders.
      assert.equal(mine, raw, `\`\\${m}\` is not an escape — it must stand as written`);
      rejected.push(m);
    }
  }
  // Non-vacuity, both ways: a sweep that landed entirely in one branch would prove
  // nothing about the other.
  assert.ok(agreed.length >= 15, `the accepted set is real (got ${agreed.length})`);
  assert.ok(rejected.length >= 15, `the rejected set is real (got ${rejected.length})`);
});

test('the variable-length hex forms agree too, surrogates included', () => {
  const bodies = [
    '\\x41', '\\u00e9', '\\U0001F600', // ordinary
    '\\uD800', '\\uDFFF', '\\U0000D800', // lone surrogates: yaml ACCEPTS these
    '\\x4', '\\u12', '\\U0001F6', // truncated
    '\\xZZ', '\\uZZZZ', // non-hex
    '\\U00110000', // past the Unicode range
  ];
  let accepted = 0;
  let refused = 0;
  for (const body of bodies) {
    const { real, mine, raw } = both(body);
    if (real.ok) {
      assert.equal(mine, real.value, `\`${body}\` must decode as yaml decodes it`);
      accepted++;
    } else {
      assert.equal(mine, raw, `\`${body}\` must stand as written`);
      refused++;
    }
  }
  assert.ok(accepted >= 6 && refused >= 5, `both branches exercised (${accepted}/${refused})`);
});

test('a lone surrogate is passed through, not filtered — the compiled path passes it too', () => {
  // Stated on its own because it is the case a reviewer will want to "fix". `yaml`
  // decodes `\uD800` to the isolated code unit without complaint, so refusing it here
  // would be this reader inventing a rule the corpus is not read by anywhere else. Any
  // downstream harm from an isolated surrogate is a property of the corpus, identical on
  // both paths, and is not this parser's to invent a divergence over.
  const { real, mine } = both('\\uD800');
  assert.equal(real.ok, true, 'yaml accepts a lone-surrogate escape');
  assert.equal(mine, real.value);
  assert.equal(mine, 'a\uD800b');
});

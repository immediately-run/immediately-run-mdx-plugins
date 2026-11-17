#!/usr/bin/env node
// Writes src/frontmatterFixture.expected.json from src/frontmatterFixture.cases.json (R3-1347).
//
// THE ORACLE IS `yaml`, NOT THIS PACKAGE. Each case declares the exact YAML text its fences
// enclose (`block`, or null when the document has no frontmatter). The expected result is
// what `yaml.parse(block)` — the call the host has always made, with no options — returns
// for that text, so the fixture asserts the agreement itself rather than what someone
// believed on the day they typed it. Whether `parseFrontmatter` finds the SAME block (the
// fence rule: BOM, CRLF, trailing spaces, unclosed, empty) is what the test then checks.
//
// The expectation is frozen: regenerate only when the `yaml` pin moves or a case is added,
// and say which in the commit. `--check` (in `verify`) recomputes it and fails on drift.
//
// Usage:  node scripts/gen-frontmatter-fixture.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASES = join(root, 'src/frontmatterFixture.cases.json');
const EXPECTED = join(root, 'src/frontmatterFixture.expected.json');

/** Whether every value in a parsed block is JSON-shaped: primitives, arrays, plain objects. */
function isJsonShaped(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonShaped);
  if (typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isJsonShaped);
}

/**
 * What one declared block must parse to. The VALUE is `yaml.parse`'s; the three outcomes
 * that yield no data (a parse error, a block that is not a map, a value outside the JSON
 * set) are the contract `src/frontmatter.ts` documents, restated here as the expectation.
 */
function expectedFor(block) {
  if (block === null) return { data: {}, hadFrontmatter: false };
  let parsed;
  try {
    parsed = parse(block);
  } catch {
    return { data: {}, hadFrontmatter: true, errorKind: 'yaml' };
  }
  if (parsed === null || parsed === undefined) return { data: {}, hadFrontmatter: true };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: {}, hadFrontmatter: true, errorKind: 'not-a-map' };
  }
  if (!isJsonShaped(parsed)) return { data: {}, hadFrontmatter: true, errorKind: 'not-json' };
  return { data: parsed, hadFrontmatter: true };
}

function main() {
  const cases = JSON.parse(readFileSync(CASES, 'utf8'));
  const names = new Set();
  const expected = {};
  for (const c of cases) {
    if (names.has(c.name)) throw new Error(`duplicate case name: ${c.name}`);
    names.add(c.name);
    if (c.block !== null && !c.source.includes(c.block)) {
      throw new Error(`case ${c.name}: its block is not part of its source`);
    }
    expected[c.name] = expectedFor(c.block);
  }
  const text = JSON.stringify(expected, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(EXPECTED, 'utf8');
    } catch {
      // missing file: reported below as drift
    }
    if (current !== text) {
      console.error(
        `✗ ${EXPECTED} is not what yaml.parse gives for ${CASES}.\n` +
          '  Run `node scripts/gen-frontmatter-fixture.mjs` and say in the commit why the expectation moved.',
      );
      process.exit(1);
    }
    console.log(`✓ frontmatter fixture: ${cases.length} cases match yaml.parse`);
    return;
  }
  writeFileSync(EXPECTED, text);
  console.log(`wrote ${EXPECTED} (${cases.length} cases)`);
}

main();

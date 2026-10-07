// Copies the published Screenery skills into this plugin.
//
// The skills are written in the Screenery repository, under `.claude/skills/`,
// and the console serves a copy of each at https://app.screenery.dev/skills/.
// That copy is what this script reads: it is public, it is checked against the
// source by Screenery's own tests, and it needs no token to fetch. This
// repository holds a third copy so a plugin install carries the skills.
//
// When anything changed, the patch version is bumped in every manifest,
// because Claude Code only offers an update when the version moves. Run with
// `node scripts/sync-skills.mjs`; the daily workflow runs it too.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'https://app.screenery.dev/skills.txt';
const skillsDir = path.join(root, 'plugins/screenery/skills');
const VERSIONED = [
  'plugins/screenery/plugin.json',
  'plugins/screenery/.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
];

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.text()).replace(/\r\n/g, '\n');
}

// The index lists each skill as an `id` line followed by a `fetch` line.
const index = await text(INDEX);
const listed = [...index.matchAll(/^\s+id\s+(\S+)\n\s+fetch\s+(\S+)$/gm)].map(([, id, url]) => ({ id, url }));
if (listed.length === 0) throw new Error(`${INDEX} lists no skills; refusing to delete them all`);

let changed = [];
for (const { id, url } of listed) {
  const body = await text(url);
  // The console is a single-page app: a path it does not have answers 200
  // with the HTML shell. A real skill starts with frontmatter naming itself.
  if (!body.startsWith('---\n') || !new RegExp(`^name: ${id}$`, 'm').test(body)) {
    throw new Error(`${url} did not return the ${id} skill`);
  }
  const file = path.join(skillsDir, id, 'SKILL.md');
  const before = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (before !== body) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body, 'utf8');
    changed.push(before === null ? `added ${id}` : `updated ${id}`);
  }
}

// A skill Screenery stopped publishing leaves the plugin too.
const keep = new Set(listed.map((s) => s.id));
for (const id of existsSync(skillsDir) ? readdirSync(skillsDir) : []) {
  if (!keep.has(id)) {
    rmSync(path.join(skillsDir, id), { recursive: true });
    changed.push(`removed ${id}`);
  }
}

let version = JSON.parse(readFileSync(path.join(root, VERSIONED[0]), 'utf8')).version;
if (changed.length > 0) {
  const [major, minor, patch] = version.split('.').map(Number);
  const next = `${major}.${minor}.${patch + 1}`;
  for (const rel of VERSIONED) {
    const file = path.join(root, rel);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll(`"version": "${version}"`, `"version": "${next}"`), 'utf8');
  }
  version = next;
}

console.log(changed.length > 0 ? `${changed.join(', ')}; version ${version}` : `skills unchanged; version ${version}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\nversion=${version}\nsummary=${changed.join(', ')}\n`);
}

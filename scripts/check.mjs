// Checks that the three hosts' manifests describe the same plugin.
//
// Claude Code, Codex and Cursor each read their own files, so one plugin is
// described five times. Nothing but this script notices when a version, a name
// or the MCP address goes out of step between them. Run it with `node
// scripts/check.mjs`; CI runs it on every pull request.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = 'plugins/screenery';
const MCP_URL = 'https://app.screenery.dev/mcp';

const errors = [];
const fail = (msg) => errors.push(msg);

function json(rel) {
  const file = path.join(root, rel);
  if (!existsSync(file)) {
    fail(`${rel} is missing`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${rel} is not valid JSON: ${e.message}`);
    return {};
  }
}

const claudeMarket = json('.claude-plugin/marketplace.json');
const codexMarket = json('.agents/plugins/marketplace.json');
const cursorMarket = json('.cursor-plugin/marketplace.json');
const claudePlugin = json(`${plugin}/.claude-plugin/plugin.json`);
const portablePlugin = json(`${plugin}/plugin.json`);
const claudeMcp = json(`${plugin}/.mcp.json`);
const portableMcp = json(`${plugin}/mcp.json`);

const entry = (market, rel) => {
  const found = (market.plugins ?? []).find((p) => p.name === 'screenery');
  if (!found) fail(`${rel} has no plugin named "screenery"`);
  return found ?? {};
};
const claudeEntry = entry(claudeMarket, '.claude-plugin/marketplace.json');
const codexEntry = entry(codexMarket, '.agents/plugins/marketplace.json');
const cursorEntry = entry(cursorMarket, '.cursor-plugin/marketplace.json');

// One version everywhere. Claude Code only offers an update when the version
// changes, so a skill edit that ships without a bump never reaches anyone.
const versions = {
  [`${plugin}/plugin.json`]: portablePlugin.version,
  [`${plugin}/.claude-plugin/plugin.json`]: claudePlugin.version,
  '.claude-plugin/marketplace.json': claudeEntry.version,
  '.cursor-plugin/marketplace.json': cursorEntry.version,
};
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1 || distinct.has(undefined)) {
  fail(`versions disagree: ${JSON.stringify(versions)}`);
}

for (const [rel, name] of Object.entries({
  [`${plugin}/plugin.json`]: portablePlugin.name,
  [`${plugin}/.claude-plugin/plugin.json`]: claudePlugin.name,
})) {
  if (name !== 'screenery') fail(`${rel} name is ${JSON.stringify(name)}, not "screenery"`);
}

// Each marketplace points at the same folder.
const wanted = `./${plugin}`;
if (claudeEntry.source !== wanted) fail(`.claude-plugin/marketplace.json source is not ${wanted}`);
if (cursorEntry.source !== wanted) fail(`.cursor-plugin/marketplace.json source is not ${wanted}`);
if (codexEntry.source?.path !== wanted) fail(`.agents/plugins/marketplace.json source.path is not ${wanted}`);

// The same MCP server in both spellings: Claude Code's `http`, and the Agent
// Plugins standard's `streamable-http` that Codex and Cursor read.
const claudeServer = claudeMcp.mcpServers?.screenery;
const portableServer = portableMcp.mcpServers?.screenery;
if (claudeServer?.type !== 'http' || claudeServer?.url !== MCP_URL) {
  fail(`${plugin}/.mcp.json must declare screenery as type "http" at ${MCP_URL}`);
}
if (portableServer?.type !== 'streamable-http' || portableServer?.url !== MCP_URL) {
  fail(`${plugin}/mcp.json must declare screenery as type "streamable-http" at ${MCP_URL}`);
}

// Every skill folder holds a SKILL.md whose frontmatter names that folder.
// A name that does not match is a skill the host loads under the wrong id.
const skillsDir = path.join(root, plugin, 'skills');
const skills = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
if (skills.length === 0) fail(`${plugin}/skills has no skills`);
for (const id of skills) {
  const file = path.join(skillsDir, id, 'SKILL.md');
  if (!existsSync(file)) {
    fail(`${plugin}/skills/${id} has no SKILL.md`);
    continue;
  }
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) {
    fail(`${plugin}/skills/${id}/SKILL.md has no frontmatter`);
    continue;
  }
  if (!new RegExp(`^name: ${id}$`, 'm').test(front[1])) {
    fail(`${plugin}/skills/${id}/SKILL.md frontmatter does not say name: ${id}`);
  }
  if (!/^description: \S/m.test(front[1])) {
    fail(`${plugin}/skills/${id}/SKILL.md frontmatter has no description`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ manifests agree on screenery ${[...distinct][0]}, ${skills.length} skills`);

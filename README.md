# Screenery for coding agents

One plugin, `screenery`, for Claude Code, Codex and Cursor. It gives your
agent two things:

- **The Screenery MCP server** at `https://app.screenery.dev/mcp`. The agent
  uses it to sign you in, create a project, push screenshots, and add the
  `screenery/push@v1` step to your CI.
- **Seven skills.** Each one is a written recipe for a Screenery job: screenshot
  tests, docs embeds, Play Store listings, demo clips, uivet evals, Playwright
  goldens and baseline comparisons.

After installing, sign in once (below). Then ask your agent: **"Set up
Screenery for this repo."**

[Screenery](https://www.screenery.dev) is a package registry for product
screenshots. CI pushes screenshots on every build, and each one gets a stable
URL that updates itself.

## Claude Code

```
/plugin marketplace add screenery/agents
/plugin install screenery@screenery
```

Or from a shell:

```bash
claude plugin marketplace add screenery/agents
claude plugin install screenery@screenery
```

Sign in: run `/mcp`, pick `plugin:screenery:screenery`, choose
**Authenticate**, and approve in the browser.

## Codex

```bash
codex plugin marketplace add screenery/agents
codex plugin add screenery@screenery
codex mcp login screenery
```

## Cursor

Cursor reads `.cursor-plugin/marketplace.json` and the plugin's portable
`plugin.json`. A team can add this repository to its team marketplace with
**Import from Repo** and the URL `https://github.com/screenery/agents`.

Without a team marketplace, add the MCP server to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "screenery": { "url": "https://app.screenery.dev/mcp" }
  }
}
```

## What is in this repository

| Path | Read by |
| --- | --- |
| `.claude-plugin/marketplace.json` | Claude Code |
| `.agents/plugins/marketplace.json` | Codex |
| `.cursor-plugin/marketplace.json` | Cursor |
| `plugins/screenery/.claude-plugin/plugin.json`, `.mcp.json` | Claude Code |
| `plugins/screenery/plugin.json`, `mcp.json` | Codex and Cursor ([Agent Plugins](https://agent-plugins.org) format) |
| `plugins/screenery/skills/*/SKILL.md` | all three |

The skills are not written here. They are written in the Screenery repository,
published at <https://app.screenery.dev/skills.txt>, and copied here once a day
by [`sync-skills.yml`](.github/workflows/sync-skills.yml). That workflow opens a
pull request and bumps the plugin's patch version. Edit a skill here and the
next sync overwrites it.

`node scripts/check.mjs` checks that every manifest names the same plugin,
version and MCP address. CI runs it on every pull request.

## License

MIT

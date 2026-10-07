---
name: screenery-screenshots
description: Write Playwright tests that capture product screenshots and publish them to Screenery, so every screenshot in a README or docs page updates itself on the next build. Use when a repository needs screenshot tests, when screenshots in docs are stale or hand-pasted, or when someone mentions Screenery, `screenery/push@v1`, `screenery push`, or an onboarding screen waiting for a first build.
---

# Publishing screenshots with Screenery

Screenery turns a folder of screenshots into stable URLs. CI pushes on every
build; each screenshot keeps one address that serves the newest bytes. The work
in a repository is always the same three things: write tests that save images,
name the files correctly, and add one step to the workflow.

Copy this folder into any repository's `.claude/skills/` to share it.

## 1. Find out what is already there

Before writing anything:

- Is Playwright installed, and is there a config? `playwright.config.*`, and
  `testDir` / `outputDir` inside it.
- Does a workflow already run those tests? `.github/workflows/*.yml`.
- **What does that workflow run ON, and what is this repository's default
  branch?** (`git symbolic-ref refs/remotes/origin/HEAD`, or
  `gh repo view --json defaultBranchRef`.) Read the workflow's `on:` block AND
  the `if:` on the job you are about to edit. This decides whether the setup
  works at all — see step 3.
- Is there a project reference to publish to — `{org}/{project}`? The person
  asking usually has it from the Screenery console's onboarding screen. Ask if
  it is not in the prompt; do not invent one.

A repository with no Playwright at all needs it installed first
(`npm init playwright@latest`, or the equivalent for its package manager).

## 2. Write the screenshot tests

If the suite already uses `toHaveScreenshot` (directories named
`*-snapshots`), do not rewrite those tests into `page.screenshot({ path })`.
Publish the files that assertion accepted. An Argos upload folder
(`./screenshots`) is `argosScreenshot` captures, which do not compare against
a baseline — publish them after a visual check, or knowing the push does not
add one. That recipe is `screenery-playwright-goldens`. This skill is for a
suite that is not comparing snapshots yet.

Capture the screens a reader of the README would want to see, not every route.
Four to ten is a good first pass: the landing or dashboard view, the main
workflow, one empty state, one settings or detail screen.

```ts
import { test, expect } from '@playwright/test';

test('dashboard', async ({ page }) => {
  await page.goto('/');
  // Wait for a real signal, never a fixed timeout: a screenshot taken mid-load
  // publishes a spinner to a URL that other people embed.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
});
```

Rules that matter, because they decide the URL:

- **Save under the pushed folder.** `test-results/` is the default the action
  and the CLI both walk, recursively. Pass `path:` explicitly —
  `page.screenshot()` with no path returns a buffer and writes no file, and
  Playwright's own `test-results/` output holds traces and failure artefacts
  rather than the shots you mean to publish.
- **The path inside that folder is the name.** `test-results/checkout/payment-form.png`
  publishes as the asset `checkout/payment-form`, served at
  `{delivery}/{org}/{project}/checkout/payment-form@latest.png`. Folders on
  disk are folders in the URL.
- **Names are lowercase `a-z0-9._-`, in `/`-separated parts**, 128 characters
  max, no leading dots, no empty parts. A file outside that grammar fails the
  whole push — Screenery rejects rather than renaming, because the name is the
  URL. `Checkout/Form.png` is an error; `checkout/form.png` is fine.
- **Keep names stable.** The name is the address other people have pasted into
  a README. A channel holds exactly what the last build pushed, so renaming or
  deleting a file **drops the old name on the next default-branch build**: its
  `@latest` URL starts answering 404 (its `@v_…` URL keeps working). The push
  log says which names went. When you rename, update every README or page that
  embeds the old URL in the same change.
- **One push is the whole set.** If this project is also fed by another push —
  a second job, another workflow, store screenshots, demo clips — each extra
  push must be partial (`partial: true` on the Action, `--partial` on the CLI),
  or it removes everything the other push published. This includes parallel
  jobs of one workflow run: they are safe on the first attempt, but re-running
  one failed job alone makes it the newest snapshot.
- **Multi-viewport captures are a folder, not a new channel.**
  `test-results/checkout/payment-form/mobile.png` (and `tablet.png`, `desktop.png`
  next to it) publishes as `checkout/payment-form/mobile` and rides the same
  `@latest` / `@pr-n` channel as every other asset. Put a Refract-style
  `findings.json` in that folder (overflow, tap targets, …) and push attaches
  the findings to each viewport's meta and publishes a findings card at
  `{family}/findings@latest.png`.
- **Shape the folders variant-last, audience first.** `player/standings/mobile`,
  never `mobile/player/standings` — grouping splits on the **last** segment, so a
  leading variant segment is legal, pushes clean, and silently never forms a
  family. Lead with the audience or area (`public/`, `player/`, `admin/`) and put
  the subject next, so related shots stay adjacent and README authors get a
  predictable prefix. Full convention: the LAYOUT rule in
  https://app.screenery.dev/llms-full.txt.
- **Only media is uploaded**: `.png .jpg .jpeg .webp .avif .gif .webm .mp4`.
  Reports, traces and logs in the same folder are ignored, not an error.
  `findings.json` is the exception: it is a sidecar, parsed rather than skipped.
  A GIF and an MP4 that share a basename (`demo.gif` next to `demo.mp4`)
  **cannot** go through `screenery push` — they derive the same asset name
  and the build is refused. That pair is `screenery demo`; see the
  `screenery-demo-video` skill.
- **Make them deterministic.** Freeze dates, seed data, hide carousels, and
  prefer `fullPage` for docs shots. Bytes that are identical to last build's
  are skipped at upload, so a stable test is also a cheaper one.

Optional CI gate, before push (or as `diff-baseline` on the Action):

```bash
npx screenery diff ./test-results --baseline ./screenery-baseline
```

Exits 1 on a pixel or findings regression. `--update` rewrites the baseline
from the current shots; commit that folder.

## 3. Add the push step

In the workflow that runs those tests, after the test step:

```yaml
- uses: screenery/push@v1
  with:
    project: {org}/{project}
    path: test-results
```

The job needs OIDC, which is how the push authenticates with no secret:

```yaml
permissions:
  id-token: write
  contents: read
  pull-requests: write
```

`project:` picks the destination — one repository can feed several projects, and
a build lands only in the project it names. Nothing else is required: no token,
no secret to rotate. A pull request from a fork gets no `id-token` permission,
so it publishes nothing, by design.

On a pull request the same step posts a preview comment (4-up strip,
walkthrough GIF/video, README/PR embed snippets) from the assets it just
pushed. That is what `pull-requests: write` is for. A missing permission is a
warning, not a failed push. Pass `comment: false` to skip the comment.

### Pin the action and the CLI, or say why you did not

`@v1` above is the spelling the console, the README and the onboarding screen
all teach, so it is what a reader sees everywhere and what this skill writes by
default. It is also a **mutable tag**: whoever can move it changes what runs in
a job that holds `id-token: write`. Being a first-party action makes that a
smaller risk, not a different one.

So in a repository that already pins its other actions by commit, pin this one
too rather than make an exception for the vendor's own:

```yaml
- uses: screenery/push@<commit-sha> # v1
```

Read the commit `v1` currently points at from the `screenery/push` repository;
do not copy a SHA out of a document that may have aged. Screenery's own
`.github/workflows/self-screenshot.yml` does exactly this, and says why in a
comment above the step.

The same split applies to the `npx screenery …` commands in this skill. They
float on the newest CLI, which is right for a one-off command a person runs and
watches, and wrong for anything unattended — there, pin `npx screenery@<version>`.
Inside the Action this is already handled: it runs a pinned CLI version, so the
workflow step is version-pinned even when the tag reference is not.

### The step must run on the default branch. Check this before you finish.

**`@latest` follows the repository's default branch.** A build from `main` (or
`master`, or whatever this repository actually calls it) moves it. A
pull-request build publishes to `pr-{n}` and never moves `@latest` — a PR is
unmerged work, and `@latest` is what strangers see in the README.

A project's *first* build creates `@latest` from whatever branch it came from,
so a PR-only setup looks like it worked. It is the second build that reveals
the problem, by changing nothing.

So a step added to a workflow that only runs on `pull_request` gives you a
README frozen on the screenshots from the pull request that set Screenery up.
This has happened for real. It is the single most likely way to get this wrong,
and nothing fails: the run is green, the console lists every asset, the URLs
resolve, and the pictures never change again.

Two things to check, and say out loud what you found:

1. The workflow's `on:` includes a `push` to the default branch —
   `push: { branches: [<default branch>] }`, or an unfiltered `push:`.
2. The job carrying the step is not gated away from that event by its own
   `if:`. A guard like `if: github.event_name == 'pull_request' || ...` is
   exactly the trap: the trigger is there and the job still skips.

If the repository deliberately does not run the suite on its default branch —
a costly end-to-end job, say — **do not add the trigger silently.** Say what it
costs (one more run per merge) and what the alternative is (`@latest` updates
only as often as the workflow does, or a person moves it with
`npx screenery promote`), and let the person choose.

## 4. Verify before you claim it works

1. Run the tests locally, then ask the CLI what it would publish:
   `npx screenery push ./test-results --project {org}/{project} --dry-run`
   That prints the manifest — the exact set of asset names about to be created,
   with the bytes and digest of each — and names every file it skipped and why.
   It needs no credential: `--dry-run` returns before the CLI looks for one.
   **Do not substitute a listing of `test-results/` for this.** The folder is a
   superset of the assets: only media is uploaded, and symlinks are skipped
   even when they are named `.png`.
2. Push from the machine to check the round trip end to end, if the person has
   a credential:
   `npx screenery push ./test-results --project {org}/{project}`
3. **Name the event that will move `@latest`.** "A push to `master` runs this
   workflow, and that is what updates the URLs" — or, if nothing does, say so
   plainly instead of reporting a finished setup.
4. After the first CI run, fetch one `@latest` URL and check it answers 200.
   A 404 there means nothing was promoted to `latest`, whatever the run said.
5. Report the names and URLs you created, not just "done".

## 5. Embed the URL

A published screenshot goes into a README as ordinary Markdown:

```md
![Dashboard](https://cdn.screenery.dev/{org}/{project}/dashboard@latest.png)
```

`@latest` is the moving reference — the next build **from the default branch**
replaces the bytes at that address. Builds from other branches and from pull
requests do not touch it; they get `@{branch}` and `@pr-{n}`, which are useful
in a PR comment and wrong in a README.

**`@{branch}` is not always the branch name.** Channel names are `a-z0-9._-`
with no `/`, so a branch that is not already one is converted: lowercase, every
other character to a single `-`, leading `v_` to `v-`, leading dots dropped, cut
to 64. `feature/login` → `@feature-login`. The push output prints the mapping,
and the finalize response carries `derived_from`, so read the channel out of the
push rather than assuming it from the branch — especially since two branches can
land on one channel. A branch that reduces to `latest` or `pr-{n}` is refused
rather than converted.

For a docs page that should only change on release, embed a channel instead and
move it deliberately:
`npx screenery promote {org}/{project} --from <default branch> --to release`,
then use `@release` in the URL. Promotion uses the same credential as a push:
GitHub OIDC in a job with `id-token: write`, in a repository bound to the
project, otherwise `SCREENERY_TOKEN`. CI can promote; `npx screenery login`
does not supply it.

## 6. Optional URL-clip for live page references

This is **beside** the CI Playwright path, not a replacement of it. Use it when
a docs page or README should show a live site (or a partner capture of one)
with a dated daily channel, while `@latest` continues to follow the default-branch
Playwright suite.

```bash
npx screenery clip https://example.com --project {org}/{project} --name docs/home --dry-run
npx screenery clip https://example.com --project {org}/{project} --name docs/home
```

What it writes, and what it refuses to:

| Ref | Use |
| --- | --- |
| `@clip` | live pointer, moved on every clip |
| `@YYYY-MM-DD` | that UTC day's latest clip — moves if you clip again that day |
| `@v_…` | content-addressed bytes, cached forever |
| `@latest` | **not moved.** That still follows the default branch. |

`--dry-run` prints the plan and exits: no capture, no push, no partner fetch.
`--source auto` (the default) uses `--file` if you pass one, else Playwright
if it is installed, else the [screenshotit.app](https://screenshotit.app/)
partner (`GET screenshotit.app/{host}{path}[@mobile][@full][@social]`). A clip
inside GitHub Actions still cannot inherit `GITHUB_REF` and take over `@main`.

Do not create a production project, binding, or workflow just to try a clip.
Merge does not verify one. Keep the Action from step 3 for the screenshots a
README should refresh on every merge.

## When an agent has the MCP server

If the Screenery MCP server is configured (`npx -y screenery mcp`), prefer its
tools over shelling out: they carry the runbook, create the project, and push
the first screenshot without a workflow run. `screenery_clip` is the optional
live-page path from section 6 — local only, beside CI, never a replacement
for `screenery_push` / `screenery_setup_ci`. This skill still applies — it is
what to put in the repository so the next build keeps doing it.

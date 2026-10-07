---
name: screenery-playwright-goldens
description: Publish Playwright toHaveScreenshot goldens after that assertion passes, or an Argos upload folder. argosScreenshot does not compare against a baseline — run a visual check before push, or publish those captures without that guarantee. Optional screenery diff --baseline fails the job before anything is sent. Use when a repository already has Playwright snapshots or an Argos screenshot directory and should put those files on Screenery without a second assertion library.
---

# Playwright goldens → Screenery

Playwright's `toHaveScreenshot` already decides whether the pixels match.
`argosScreenshot` captures an image and does not compare it to a baseline, so
a passing capture test is not a local pixel gate. Screenery does not add
another snapshot assertion. Publish Playwright goldens after that assertion
passes. For an Argos folder, run a visual check before push, or publish the
captures without that guarantee.

Copy this folder into any repository's `.claude/skills/` to share it.

## Which folder you have

Two shapes. They do not use the same flag.

### A. Playwright `*-snapshots` directories

Default layout, from [Playwright's snapshot docs](https://playwright.dev/docs/test-snapshots):

```text
tests/example.spec.ts
tests/example.spec.ts-snapshots/landing-chromium-linux.png
tests/fixtures/logo.png
```

`logo.png` is a fixture. `test-results/` holds traces and failure shots
(`-actual`, `-diff`). Neither is a golden.

```bash
npx screenery push ./tests --project {org}/{project} --playwright-snapshots --dry-run \
  --commit-timestamp 2026-09-21T00:00:00Z
npx screenery diff ./tests --baseline ./screenery-baseline --playwright-snapshots
```

`--playwright-snapshots` keeps media whose path sits inside a directory named
`*-snapshots`, or the snapshot directory itself when that is the directory you
pass. Everything else is listed and ignored. Text snapshots (`hero.txt` from
`toMatchSnapshot`) are ignored as not media.

The asset name is the path under `./tests` with the extension removed:

```text
example.spec.ts-snapshots/landing-chromium-linux
```

Names are not rewritten. A capital letter — a test title Playwright kept, or
`Landing.png` — fails the whole push and names the file. Pass a lowercase
name:

```ts
await expect(page).toHaveScreenshot('landing.png');
```

The platform suffix (`-linux`, `-darwin`) is part of Playwright's default name.
That is two assets when you keep both. A README should point at the one CI
produces. Dropping the suffix is a Playwright `snapshotPathTemplate` change,
not something Screenery does on the way in.

Optional gate, before anything is sent. It compares the goldens, not the
fixtures:

```bash
npx screenery push ./tests --project {org}/{project} \
  --playwright-snapshots \
  --diff-baseline ./screenery-baseline
```

`--update` copies only the golden files into the baseline:

```bash
npx screenery diff ./tests --baseline ./screenery-baseline --playwright-snapshots --update
```

In the workflow, after the Playwright step. The Action's `version` pin must be
a CLI that includes `--playwright-snapshots`; until that release, set `version`
explicitly. Leaving the pin and setting the input makes the published CLI
reject an unknown flag.

```yaml
- uses: screenery/push@v1
  with:
    project: {org}/{project}
    path: tests
    playwright-snapshots: true
    diff-baseline: screenery-baseline # omit to publish with no second gate
    version: <cli that includes --playwright-snapshots>
```

### B. Argos upload folder, or a dedicated snapshotDir

`argosScreenshot(page, "homepage")` writes `./screenshots` when it is not
uploading through the reporter (`options.root`). `argos upload ./screenshots`
and `screenery push ./screenshots` take that same directory. No
`--playwright-snapshots` flag: every image in the folder is a screenshot.

```bash
npx screenery push ./screenshots --project {org}/{project} --dry-run \
  --commit-timestamp 2026-09-21T00:00:00Z
npx screenery diff ./screenshots --baseline ./screenery-baseline
```

The name you pass to `argosScreenshot` is the asset name, so it has to already
be a legal Screenery name: lowercase `a-z0-9._-` segments, no leading dot.
`homepage` is fine. `Home Page` is an error that names the file. Screenery
does not slugify it.

A Playwright config that collects goldens into one directory is the same
shape. `toHaveScreenshot` is still the pixel gate:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  snapshotDir: './screenery-goldens',
  snapshotPathTemplate: '{snapshotDir}/{platform}{/projectName}/{testFilePath}/{arg}{ext}',
});
```

`toHaveScreenshot('landing.png')` lands at
`screenery-goldens/<platform>/<project name if set>/<test file path>/landing.png`.
Push `./screenery-goldens` with no flag. `{arg}` keeps the case you typed.
`{platform}` and `{projectName}` stop two projects from writing one file.

```bash
npx screenery push ./screenery-goldens --project {org}/{project} --dry-run \
  --commit-timestamp 2026-09-21T00:00:00Z
npx screenery diff ./screenery-goldens --baseline ./screenery-baseline
```

```yaml
- uses: screenery/push@v1
  with:
    project: {org}/{project}
    path: screenery-goldens
    diff-baseline: screenery-baseline # optional
```

`diff-baseline` on the current Action pin already works for this shape. It
does not need `--playwright-snapshots`.

## What not to change

- Do not replace `toHaveScreenshot` with `page.screenshot()` plus
  `screenery diff` in order to publish. The diff command is an optional local
  gate. The registry publishes after the suite's own check.
- Do not point this recipe at `test-results`. That directory is traces and
  failure artefacts, not the committed goldens. `screenery-screenshots` is the
  skill that writes new shots into `test-results` on purpose.
- Do not rename files to make the URL prettier. The name is the address. Ask
  before changing one that is already embedded.

## Try it before you claim it published

`--dry-run` prints the manifest — asset names, digests, and every skipped
file — and returns before the CLI looks for a credential. It does not create
a project, mint a token, or upload.

Outside GitHub Actions there is no `GITHUB_RUN_NUMBER`, so pass an ordering
source. `--dry-run` still returns before any credential lookup.

```bash
npx screenery push ./tests --project {org}/{project} --playwright-snapshots --dry-run \
  --commit-timestamp 2026-09-21T00:00:00Z
npx screenery push ./screenshots --project {org}/{project} --dry-run \
  --commit-timestamp 2026-09-21T00:00:00Z
npx screenery diff ./tests --baseline ./screenery-baseline --playwright-snapshots
```

Read the names. A fixture in that list means the flag was left off a
Playwright tree, or an image outside `*-snapshots` was inside the Argos
folder on purpose. A rejected name is a rename in the test, not a slug the
CLI should invent.

A real push still needs the project's credential (GitHub OIDC in Actions, or
`SCREENERY_TOKEN` elsewhere) and still moves channels by the usual rules:
`@latest` follows the default branch. Merge is not verification that a URL
is live.

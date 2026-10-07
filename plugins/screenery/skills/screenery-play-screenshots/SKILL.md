---
name: screenery-play-screenshots
description: Capture Google Play Console listing screenshots with Playwright at the exact sizes Play requires, and publish them to Screenery so every build regenerates them at stable URLs a person downloads at listing time. Use when a repository needs Play Store screenshots, when store listing images are stale or hand-made, or when someone mentions Play Console screenshots, store listing assets, feature graphic, phone/tablet screenshots, or Screenery for a mobile app.
---

# Play Console listing screenshots with Screenery

Google Play does not accept a URL. Every listing image is a file uploaded in
the Play Console, by hand or by the Play Developer API. So this is not the
README case, where the URL *is* the delivery. Here Screenery is the **source of
truth and the build**: CI regenerates every listing image on every merge, each
one keeps one stable address, and a person downloads the set when they update
the listing.

That difference drives everything below. In particular: **exact pixel
dimensions matter, and `fullPage` is wrong.**

Copy this folder into any repository's `.claude/skills/` to share it.

## 0. What Play actually requires

Get these wrong and the console rejects the upload with no useful message.

| Asset | Count | Size | Format |
| --- | --- | --- | --- |
| Phone screenshots | 2–8, **required** | 9:16 or 16:9. Min side ≥ 320px, max side ≤ 3840px, and neither side may exceed 2× the other | PNG or JPEG, ≤ 8 MB |
| 7-inch tablet | up to 8 | same ratio and bounds | PNG or JPEG |
| 10-inch tablet | up to 8 | same ratio and bounds | PNG or JPEG |
| Feature graphic | exactly 1, **required** | **1024 × 500**, no transparency | PNG or JPEG |
| App icon | exactly 1 | **512 × 512**, 32-bit PNG with alpha | PNG |

Tablet screenshots are optional, but without them Play can show a "not
optimized for tablets" note on large-screen devices. Ask whether the listing
targets tablets before deciding to skip them.

**The app icon is in the table and out of scope for this skill.** It is listed
so you can check it off, not so you go looking for a step that captures it.
The icon is not a screen capture — it is the launcher icon the app already
ships, and the only correct 512 × 512 is the one exported from that same
source: `android/app/src/main/res/mipmap-*` in a native Android project, the
`icon` entry in `app.json` for Expo, the icon resources the Android platform
folder holds for Capacitor, or the designer's file all of those came from.
Screenshotting a page to make one would put an icon on the store that does not
match the installed app. Export it from the app's own source and upload it by
hand. **Say this when you hand the set over** (step 7), so nobody reads the
missing icon as an oversight.

The sizes this skill captures, which sit safely inside those bounds:

- **phone** — 1080 × 1920
- **tablet-7** — 1200 × 1920
- **tablet-10** — 1600 × 2560
- **feature-graphic** — 1024 × 500

Not captured: the app icon, per the note above.

## 1. Find out what is already there

Before writing anything:

- Is Playwright installed, and is there a config? `playwright.config.*`, and
  `testDir` / `outputDir` inside it.
- Does a workflow already run those tests? `.github/workflows/*.yml`.
- **What does that workflow run ON, and what is this repository's default
  branch?** (`git symbolic-ref refs/remotes/origin/HEAD`, or
  `gh repo view --json defaultBranchRef`.) Read the workflow's `on:` block AND
  the `if:` on the job you are about to edit. See step 4 — this is the single
  most common way to get the setup wrong.
- Is there a Screenery project reference — `{org}/{project}`? Ask if it is not
  in the prompt; do not invent one. If it does not exist yet, see step 2.
- Which locales does the listing ship in? One (`en-us`) is fine to start, but
  the folder layout below leaves room for more without renaming anything.

A repository with no Playwright needs it installed first
(`npm init playwright@latest`, or the equivalent for its package manager).

## 2. Create the Screenery project

Store assets belong in **their own project**, separate from any docs or README
screenshots the repository already publishes. Listing images have a different
lifecycle — they change when the listing changes, not when the docs rebuild —
and sharing a project means a docs build moves the store assets' `@latest`.
Worse, a channel holds exactly what the last push carried: in a shared
project, the docs push would **remove** every store screenshot from `@latest`
and the store push would remove the docs ones. If the person insists on one
project anyway, every push to it needs `partial: true` on the Action
(`--partial` on the CLI) — say so, and prefer the separate project.

There is no CLI command for creating a project. Two ways:

- **The console onboarding screen**, which is where the `{org}/{project}` ref
  and the first-build instructions come from.
- **`screenery_create_project`** if the Screenery MCP server is configured.
  `visibility` is required, not defaulted.

**Pick `unlisted` visibility.** Store images are not secret — they are about to
be on a public store page — but they should not be browsable or indexable
before the listing ships. `unlisted` resolves at its exact URL with no
credential, which is what makes "a person downloads the set" work, and does not
list them. `private` would mean every download needs a signed URL, and `public`
puts unreleased marketing art on a browsable index.

## 3. Write the capture tests

This is the part that differs most from ordinary screenshot tests.

**Use a fixed viewport and `fullPage: false`.** A Play screenshot must be
exactly the declared size. `fullPage: true` captures however tall the page
happens to be, which produces an aspect ratio Play rejects.

**Do not set the viewport to the output size.** A 1080px-wide viewport renders
the *desktop* layout, so you get a desktop app in a phone-shaped frame. Set a
phone-sized CSS viewport and a `deviceScaleFactor` that multiplies up to the
required pixels.

Define the form factors as Playwright projects:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e/store',
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 540, height: 960 },   // × 2 = 1080 × 1920
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet-7',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 600, height: 960 },   // × 2 = 1200 × 1920
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
    {
      name: 'tablet-10',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 800, height: 1280 },  // × 2 = 1600 × 2560
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
  ],
});
```

`isMobile` is Chromium-only and changes how the page reports itself; leave it
off for the tablet projects unless the app has a tablet-specific breakpoint you
mean to trigger.

Then one test file that runs under every project, writing into a folder named
after the project:

```ts
import { test, expect } from '@playwright/test';

const LOCALE = 'en-us';

// Numeric prefixes fix the order a person uploads them in — Play shows
// listing images in upload order, and 01 is the one most people ever see.
const SHOTS = [
  { name: '01-dashboard', path: '/' },
  { name: '02-workout',   path: '/workout' },
  { name: '03-history',   path: '/history' },
  { name: '04-settings',  path: '/settings' },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }, testInfo) => {
    await page.goto(shot.path);
    // Wait for a real signal, never a fixed timeout. A screenshot taken
    // mid-load publishes a spinner to an address someone will ship to a store.
    await expect(page.getByRole('main')).toBeVisible();
    await page.screenshot({
      path: `test-results/play/${LOCALE}/${testInfo.project.name}/${shot.name}.png`,
      fullPage: false,
    });
  });
}
```

The feature graphic is a designed 1024 × 500 banner, not a screen capture. If
the repository has one as HTML, capture it the same way at that exact viewport
with `deviceScaleFactor: 1`. If it is a designer's file, leave it out and say
so — do not generate marketing art from a page that was not built for it.

Rules that matter, because they decide the URL:

- **Save under the pushed folder.** `test-results/` is what the action and the
  CLI walk, recursively. Pass `path:` explicitly — `page.screenshot()` with no
  path returns a buffer and writes no file.
- **The path inside that folder is the name.**
  `test-results/play/en-us/phone/01-dashboard.png` publishes as the asset
  `play/en-us/phone/01-dashboard`, served at
  `{delivery}/{org}/{project}/play/en-us/phone/01-dashboard@latest.png`.
- **Names are lowercase `a-z0-9._-`**, in `/`-separated parts, 128 characters
  max. `en-US` is an error and fails the whole push — Screenery rejects rather
  than renaming, because the name is the URL. Use `en-us`.
- **Keep names stable.** `01-dashboard` stays `01-dashboard` even if the screen
  is renamed. The number is listing position, not a title.
- **`locale/device/` up front is deliberate here.** Screenery's general advice is
  variant-last (`checkout/payment-form/mobile`) so shots group into a viewport
  family; see the LAYOUT rule in https://app.screenery.dev/llms-full.txt.
  Play listings are the exception: a person downloads one device's ordered set at
  listing time, so the device folder is the deliverable, not a variant to group.
- **Make them deterministic.** Freeze dates, seed the data, hide carousels and
  animations, and disable any "new" badge or notification count that changes
  between runs. Identical bytes are skipped at upload, so a stable test is also
  a cheaper one.
- **No device frames, no added borders.** Play policy treats a frame implying a
  different device or platform as misleading. Capture the app itself.

## 4. Add the push step

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

A pull request from a fork gets no `id-token` permission, so it publishes
nothing, by design. On a pull request the same step posts a preview comment
from the listing images it just pushed — that is what `pull-requests: write`
is for.

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
`master`) moves it. A pull-request build publishes to `pr-{n}` and never moves
`@latest`.

A project's *first* build creates `@latest` from whatever branch it came from,
so a PR-only setup looks like it worked. It is the second build that reveals
the problem, by changing nothing. Nothing fails: the run is green, the console
lists every asset, the URLs resolve, and the pictures never change again.

Two things to check, and say out loud what you found:

1. The workflow's `on:` includes a `push` to the default branch.
2. The job carrying the step is not gated away from that event by its own
   `if:`.

## 5. Add a `store` channel for what is actually live

`@latest` is what the default branch last built. That is not the same as what
is on the Play listing right now, and the gap between them is the useful thing
to be able to see.

After uploading a set to Play, mark it:

```bash
npx screenery promote {org}/{project} --from <default branch> --to store
```

Now `@store` is the set that matches the live listing and `@latest` is the
current build. Diffing the two answers "does the store show the current app?"
— which is the question nobody can otherwise answer without opening Play.

Promotion uses the same credential as a push: GitHub OIDC in a job with
`id-token: write`, in a repository bound to the project, otherwise
`SCREENERY_TOKEN`. CI can promote; `npx screenery login` does not supply it.

## 6. Verify before you claim it works

1. Run the tests locally, then ask the CLI what it would publish:
   `npx screenery push ./test-results --project {org}/{project} --dry-run`
   That prints the manifest — the exact set of asset names about to be created
   — and names every file it skipped and why. It needs no credential:
   `--dry-run` returns before the CLI looks for one.
   **Do not substitute a listing of `test-results/` for this.** The folder is a
   superset of the assets: only media is uploaded, and symlinks are skipped
   even when they are named `.png`.
2. **Check the dimensions**, do not assume them. Every phone file must be
   exactly 1080 × 1920, and so on. The table in step 0 allows JPEG as well as
   PNG, and the two store their size in different places, so the check has to
   read both — a PNG-only check passes a mis-sized `.jpg` in silence. One
   command over the whole tree, still with no dependencies:
   ```bash
   node -e '
   const fs = require("fs"), p = require("path");
   // PNG: IHDR is always the first chunk, so width/height sit at fixed offsets.
   // JPEG: no fixed offset. Walk the marker chain to the frame header (SOFn),
   // which carries height then width. C4/C8/CC are other segments, not frames.
   function size(b) {
     if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
       return [b.readUInt32BE(16), b.readUInt32BE(20)];
     if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
     for (let i = 2; i + 9 < b.length; ) {
       if (b[i] !== 0xff) { i++; continue; }
       const m = b[i + 1];
       if (m === 0xff) { i++; continue; }
       if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
       if (m === 0xda) break;
       if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
         return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
       i += 2 + b.readUInt16BE(i + 2);
     }
     return null;
   }
   (function walk(d) {
     for (const f of fs.readdirSync(d, { withFileTypes: true })) {
       const q = p.join(d, f.name);
       if (f.isSymbolicLink()) continue;
       if (f.isDirectory()) { walk(q); continue; }
       if (!/\.(png|jpe?g)$/i.test(f.name)) continue;
       const wh = size(fs.readFileSync(q));
       console.log(wh ? wh[0] + "x" + wh[1] + " " + q : "UNREADABLE " + q);
     }
   })("test-results");
   '
   ```

   `UNREADABLE` means the file is not the format its extension claims, or is
   truncated — treat it as a failure, not a gap in the script. WebP and AVIF
   are not read here because Play does not accept them; if a test starts
   emitting one, that is the bug to fix.
   A file at the wrong size is a rejected upload, and the console says little
   about why.
3. Push from the machine to check the round trip, if the person has a
   credential: `npx screenery push ./test-results --project {org}/{project}`.
4. **Name the event that will move `@latest`.** "A push to `main` runs this
   workflow, and that is what updates the URLs" — or, if nothing does, say so
   plainly instead of reporting a finished setup.
5. After the first CI run, fetch one `@latest` URL and check it answers 200. A
   404 there means nothing was promoted to `latest`, whatever the run said.
6. Report the asset names and URLs you created, not just "done".

## 7. Hand the set to a person

The deliverable is a list they can work down while the Play Console is open in
the other tab, in upload order:

```
Phone (upload in this order)
  1. https://cdn.screenery.dev/{org}/{project}/play/en-us/phone/01-dashboard@latest.png
  2. https://cdn.screenery.dev/{org}/{project}/play/en-us/phone/02-workout@latest.png
  ...
Feature graphic
     https://cdn.screenery.dev/{org}/{project}/play/feature-graphic@latest.png

App icon
     Not published here — export 512 × 512 from the app's own launcher icon
     (see step 0). This is the one asset the build does not produce.
```

Say which channel they are downloading — `@latest` for the current build,
`@store` for the set already live — and remind them to run the promote in step
5 once the upload is done, so the two stay meaningful. Name the app icon as a
deliberate gap rather than leaving it off the list, or the next person will
assume the build covers it.

## When an agent has the MCP server

If the Screenery MCP server is configured (`npx -y screenery mcp`), prefer its
tools over shelling out: `screenery_create_project` for step 2,
`screenery_push` to publish the first set without waiting for a CI run, and
`screenery_verify` for step 6. This skill still applies — it is what to put in
the repository so the next build keeps doing it.

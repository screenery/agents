---
name: screenery-embed
description: Put published Screenery screenshots into docs, help pages and marketing copy, and keep them from rotting — a manifest, a shortcode/component, and an audit that pairs every embedded URL with the test that captures it. Use when a repository already pushes to Screenery but nothing on its site embeds the URLs, when docs or a homepage still carry hand-exported PNGs, or when someone asks how to keep screenshots in documentation current.
---

# Embedding Screenery screenshots

`screenery-screenshots` is the producing half: write tests, name the files,
push from CI. **This is the consuming half** — putting those URLs into pages
and keeping page and picture from drifting apart.

The two halves fail differently. A broken push is loud: a red CI step. A broken
embed is silent — a 404 image on a live page that no test, build or deploy
notices, because the only thing that resolves the URL is a stranger's browser.
Everything here exists to make that failure loud somewhere.

## 0. The symptom that means you are in the right place

A repository pushes to Screenery on every build, every asset resolves, and
**nothing on the site embeds a single one of them.** The pipeline is a
photograph nobody looks at.

Check it in one command before anything else. Treat this as a sample, not a
closed list — `.mdx`, `.astro`, `.vue` and `.svelte` are in it because they
are common page sources, and the site may still use others. Add the globs this
repository actually builds from before you conclude there are no embeds.

```bash
# Substitute the project's own delivery host if it is not the default one --
# `npx screenery doctor` prints it, and the read API returns delivery_base_url.
grep -rn "cdn.screenery.dev" --include="*.html" --include="*.md" --include="*.mdx" --include="*.njk" --include="*.astro" --include="*.jsx" --include="*.tsx" --include="*.vue" --include="*.svelte" .
```

No hits *after that follow-up*, plus a push step in CI, is the whole problem.
While you are there, find what the site uses *instead* — that is the work:

```bash
git log -1 --format=%ci -- path/to/the/screenshot.png
```

A hero image last touched eleven months ago is advertising a build nobody runs.
That date is the most persuasive thing you will find; put it in your report.

## 1. One manifest, not URLs scattered through pages

Do **not** paste `https://cdn.screenery.dev/...` into twenty pages. Put every
asset in one data file and have pages reference it by a local key.

```js
// data/screenshots.js

// The delivery origin. https://cdn.screenery.dev is the DEFAULT, not the only
// value: the CLI reads SCREENERY_CDN_URL, the read API returns
// `delivery_base_url` per project, and a project on a custom hostname or a
// self-hosted deployment serves from its own. Take it from the deployment's
// config rather than typing it, and use the SAME value in the preconnect (§4),
// the CSP (§4) and the verification fetches (§8) — those three and this one
// have to agree or you get a tag that connects to the wrong host, a policy
// that blocks the right one, and a check that proves nothing.
const CDN = process.env.SCREENERY_CDN_URL ?? "https://cdn.screenery.dev";
const PROJECT = "acme/dashboard";
const CHANNEL = "latest";

// LAYOUT PREFIX. Each entry names ONE asset; the layout is a prefix on the
// published name, so `app/dashboard` is really two captures:
//
//   desktop/app/dashboard      <- the desktop pass wrote it
//   mobile/app/dashboard       <- the phone pass wrote it
//
// That convention has to be agreed with the capture side, which is what adds
// the prefix (see `screenery-screenshots`). It is what lets one manifest entry
// and one key drive a two-source <picture> without listing both names.
//
// Sizes belong to the LAYOUT, not the entry, because these are viewport
// captures: every asset in a pass comes out at that pass's viewport. Pinned so
// the browser reserves the box BEFORE the bytes arrive — see §3.
const LAYOUTS = {
  desktop: { prefix: "desktop", width: 1280, height: 720 },
  mobile: { prefix: "mobile", width: 750, height: 1334 },
};

// EXT IS THE STORED FORMAT, not a preference. Screenery serves the bytes it
// holds and this release transcodes nothing, so an extension naming a
// different type answers 501 not_implemented — every image on the site, in one
// go, for a project whose captures are JPEG and whose manifest says .png.
// Playwright writes PNG, which is why that is the default here; if the capture
// side writes something else, say so per entry.
const DEFAULT_EXT = "png";

const url = (layout, asset, ext = DEFAULT_EXT) =>
  `${CDN}/${PROJECT}/${LAYOUTS[layout].prefix}/${asset}@${CHANNEL}.${ext}`;

const shots = [
  {
    key: "dashboard",              // what pages type. Local. Rename freely.
    asset: "app/dashboard",        // the Screenery name. PERMANENT. See §2.
    alt: "The dashboard showing this month's revenue, open tickets and…",
    caption: "Everything at a glance.",
    doc: "getting-started",        // which page it illustrates, or null
    // ext: "webm",                // only when the capture is not PNG
  },
];
```

**If a repository captures only one layout, delete `mobile` from `LAYOUTS` and
drop the `<source>` in §3.** One good desktop screenshot beats a phone URL that
404s — do not carry a layout the capture side does not actually shoot. The
audit in §5 is what tells you which layouts exist: every layout named here must
have a capture behind it, in both directions.

Every `asset` in this file has to be **public**. The shortcode emits an
anonymous URL, which is the delivery contract for `public` and a 404 for
`unlisted` or `private`. Those two need a signed URL or a read token, and a
credential does not belong in HTML a stranger can view-source. Leave them out
of the manifest.

Five things this buys that scattered URLs do not:

- **One place to change the channel.** `@latest` → `@release` is one edit.
- **`alt` and `caption` live beside the asset**, so the words describing a
  picture are updated in the same breath as the picture.
- **Dimensions exist once**, so every embed pins them and none reflows.
- **`doc:` makes the set auditable** — you can ask "which pages should have a
  screenshot and don't" and get an answer.
- **An unknown key can fail the build.** A URL in a page can only fail in a
  browser.

`doc: null` is a real answer, not a TODO. A sign-in screen captured for the
README belongs in the manifest with `doc: null`, which says *deliberately
embedded nowhere* out loud.

## 2. The asset name is a permanent URL. The local key is not.

Renaming an `asset` string does not move a screenshot. It mints a **new** one
and strands every page, README and external link pointing at the old name.
Treat it like a published URL slug.

So when a screenshot needs a better name, the honest options are: leave it, or
add the new name and keep publishing both until nothing references the old one.
Never "rename to match" as a way to fix a broken embed — that converts one
broken page into two.

Which is why the shape is worth getting right before the first push: variant
last (`player/standings/mobile`), audience or area first. See the LAYOUT rule
in https://app.screenery.dev/llms-full.txt.

Renaming `key` is free. It appears only inside this repository.

## 3. A shortcode or component, never a bare `<img>`

Give pages one construct that reads the manifest:

```njk
{% screenshot "dashboard" %}
```

```jsx
<Screenshot name="dashboard" />
```

It must do four things, and each is a bug you are pre-empting:

1. **Pin `width` and `height` from the manifest.** Without them a cross-origin
   image reflows the page as it lands (Cumulative Layout Shift). This is the
   single most common defect in hand-written embeds and it is worst on a hero,
   where the screenshot is usually the LCP element.
2. **Emit every layout the manifest declares.** `<picture>` with a `media`
   source for the phone capture, each pinned to that layout's own dimensions
   (`LAYOUTS` in §1 — the layout prefix is what turns one entry into two URLs).
   A 1280×720 desktop shot shrunk into a 375px column is unreadable — it is
   *there*, which is why nobody notices it is useless. A repository that shoots
   one layout emits one `<img>` and no `<source>`.
3. **`loading="lazy"` and `decoding="async"`** for anything below the fold,
   which is nearly every documentation use.
4. **Throw on an unknown key.** A build that stops and names the bad key is far
   cheaper than a 404 someone reports three weeks later. This is the same
   bargain the push makes when it rejects a bad filename instead of renaming it.

**The hero is usually the one exception**, and write it out longhand rather than
teaching the shortcode a mode: it needs `loading="eager"` and
`fetchpriority="high"`, which are exactly wrong everywhere else. Have it read
its URL and dimensions from the manifest anyway, so it stays inside the audit.

### Do not ask for a format Screenery does not hold

The extension in the URL is the stored format. This release does not transcode.
A `.webp` URL for a stored PNG is a conversion request the Worker cannot
satisfy: it answers `501 not_implemented` rather than serving PNG bytes under
a `.webp` name, or 404, which would claim the asset does not exist. Transform
params (`?w=`, and the rest) are the same refusal. Serve what is stored, with
no transform params.

This usually costs nothing: a viewport PNG of a real UI is typically smaller
than the full-page composite it replaces.

## 4. `preconnect`, but only on pages that use it

The CDN is a third origin, so the browser needs a DNS lookup plus a TCP and TLS
handshake before the first byte — and on a hero image it will not start any of
it until the parser reaches the `<img>`.

```html
<!-- The project's delivery origin - the default below, or whatever
     SCREENERY_CDN_URL / delivery_base_url says. Must be the SAME origin the
     manifest builds URLs from, or this tag warms a connection nothing uses. -->
<link rel="preconnect" href="https://cdn.screenery.dev" crossorigin>
```

Two things people get wrong:

- **`crossorigin` is not optional.** Images are fetched anonymously; a
  preconnect without it opens a connection in a different credential mode that
  the image request cannot reuse. The tag then does nothing while looking right.
- **Scope it.** Site-wide, every page with no screenshot opens a TLS connection
  it never uses. Compute the flag from the manifest so it turns itself on when a
  page gains a screenshot and off when it loses one.

### Check the Content-Security-Policy before you finish

A site with a CSP needs the delivery host in **`img-src`**, or every screenshot
is a blocked request:

```
img-src 'self' data: https://cdn.screenery.dev;
```

Again, that host is the default and not a constant — a project on a custom
hostname needs *its* origin here. Whatever the manifest builds URLs from is
what belongs in the policy, which is the argument for asserting one against the
other rather than reading both by eye.

**Check this even when the images visibly work.** A policy sent as
`Content-Security-Policy-Report-Only` does not block anything — it logs the
violation and the image still renders. So a missing origin looks completely fine
in a browser and stays that way until somebody drops the `-Report-Only` suffix,
at which point every screenshot on the site disappears at once, with nothing in
CI having gone red first.

Open the deploy preview's console and look for the violation, rather than
concluding from the pictures being there. If a pairing test already exists
(§5), assert the manifest's host is in the policy too — the two files are
another pair nothing at runtime connects.

One trap when writing that assertion: match the policy **value** first and look
for `img-src` inside it. Scanning the whole config file finds the word in the
comment explaining the directive, which usually names the CDN — so the test
passes while the real directive still blocks it.

## 5. Make the silent failure loud: pair producer and consumer

This is the part worth copying even if you take nothing else.

| | |
|---|---|
| **Producer** | the capture call in the test — `page.screenshot({ path: 'test-results/app/dashboard.png' })` |
| **Consumer** | `asset: "app/dashboard"` in the manifest |

Nothing at runtime connects those two strings. Write a test that scans both
files and asserts they agree:

- **Every manifest asset has a capture.** This is the one that matters — an
  entry with no capture behind it is a live page serving a 404.
- **Every capture has a manifest entry** (possibly `doc: null`). Untidy rather
  than broken, but it is how a forgotten screenshot gets noticed.
- **Manifest dimensions match the capture viewport.** Changing a viewport in a
  test config has no visible connection to a marketing stylesheet, so this is
  the tripwire between them. Remember the capture writes **device** pixels: a
  375×667 viewport at `deviceScaleFactor: 2` produces a 750×1334 file.
- **Manifest names obey the name grammar** — lowercase `a-z0-9._-` per
  `/`-separated part, no leading dots, 128 characters including any layout
  prefix.

Scanning source for string literals is normally a weak test. It is right here
because the thing under test **is** a string literal on both sides: the asset
name is the file path the capture writes, so a computed name could not be
checked against a manifest at all.

## 6. The deploy-order trap

**Read this before adding a manifest entry.** It is the way to create a
permanently broken image, and it looks like a perfectly ordinary commit.

Most repositories path-filter their workflows: the docs site deploys when
`site/**` changes, and the expensive end-to-end suite *skips* when only
`site/**` changes. Both are correct in isolation. Together:

> A commit that touches **only** the site — a new embed and its manifest
> entry — deploys the page and never runs the capture. The asset is never
> created. The page serves a 404 image, and it does not self-heal, because the
> next run republishes only the assets that already exist.

Do not fix this by un-filtering the workflow; that runs the whole suite on every
typo. The rule instead:

> **A new manifest entry ships in the same commit as its capture call.**

That commit touches test code by definition, which defeats the path filter. The
pairing test in §5 enforces it. Write the trap down in a comment on the
workflow's trigger block, where the next person editing those filters will see
it.

## 7. Choose the channel deliberately

`@latest` follows the **default branch**. A merge refreshes every embed; a pull
request cannot touch it. That is the right default and what makes the whole
thing worth building.

Two reasons to want otherwise, and neither is "commit the PNG back":

- **Docs for a released version.** Promote and embed a fixed channel:
  `npx screenery promote acme/dashboard --from main --to release`, then
  `@release`. Promotion uses the push credential: GitHub OIDC in a bound
  repository's job with `id-token: write`, otherwise `SCREENERY_TOKEN`.
  Floating `npx` is right for a one-off command a person runs and watches;
  anything unattended pins `npx screenery@<version>`, for the reason
  `screenery-screenshots` sets out under "Pin the action and the CLI".
- **Reviewing a redesign.** A PR build lands on `@pr-{n}`, which is useful in a
  PR comment and wrong in a page.

## 8. Verify, then report what you actually checked

1. **Fetch every embedded URL and check for 200**, once per layout the manifest
   declares (§1) — not "both", if the capture side only shoots one. Nothing in the
   repository can tell you this; the manifest agreeing with the capture file
   only proves they agree. If you cannot reach the network, **say the check was
   skipped** — do not report the URLs as healthy.
2. **Build the site and grep the output** for `cdn.screenery.dev`. Count three
   things separately: how many screenshot embeds landed, how many distinct
   pages they appear on, and how many `preconnect` tags those pages emitted.
   Embed count should match what you added. Preconnect count should match the
   page count — one origin hint per page that uses the CDN, even when that
   page has two screenshots.
3. **Look at one rendered page at desktop and phone width.** A lazy image can
   read as blank in a screenshot taken before it decodes — re-check, or assert
   on `naturalWidth` in the page rather than trusting the picture.
4. **Name the event that refreshes these images** — "a merge to `main` runs the
   e2e workflow, and that is what updates them." If nothing does, say so.
5. **Expect new assets to 404 until the first default-branch run**, and say
   which ones and for roughly how long. A reviewer who finds that themselves
   reasonably assumes the whole thing is broken.

   One exception, and it only fires once per project: if `latest` does not
   exist yet, the FIRST finalized build creates it whatever branch it came
   from. So on a brand-new project the URLs can start working from a pull
   request, and the default-branch rule above only governs every build after
   that. Do not promise a first-time setup will 404 until merge; check.

## Anti-patterns

- **A raw `<img>` to the CDN in a page.** No pinned size, no phone source, no
  build-time check. If you find one, fold it into the manifest.
- **Renaming an `asset` to make a broken embed resolve.** Two broken URLs.
- **Committing a PNG back into the repository "just until CI runs."** It never
  gets removed, and it is the exact artefact this replaces.
- **Deleting an embed because its image 404s.** First find out whether the
  capture exists and simply has not run on the default branch yet — dispatch the
  workflow instead of removing correct markup.
- **Screenshotting something with real data in it.** Captures run against seeded
  throwaway users, and the output is a permanent public URL. Say out loud, in the
  test, why what is on screen is safe to publish — especially for anything
  showing tokens, feed URLs or account identifiers.

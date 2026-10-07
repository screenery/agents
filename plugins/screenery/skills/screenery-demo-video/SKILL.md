---
name: screenery-demo-video
description: Publish a storyboard or demo clip (GIF + MP4) onto a Screenery channel so a README embed and an HTML video tag update themselves on the next default-branch build. Use when a repository has aidemo-style demos/, a storyboard.json, rendered final-demo.gif/mp4, or wants a self-updating product-demo embed instead of committing media to git.
---

# Demo clips on Screenery channels

Screenery already stores GIF and MP4. What it did not do, and what this
skill is for, is the **storyboard → clip → channel** loop: a take that
produces both a README GIF and a docs MP4, published as two assets that
share a clip name, with paste-once `@latest` embeds.

This is **not a renderer**. aidemo (and anything else that writes
`output/final-demo.{gif,mp4}` from a `storyboard.json`) is the capture
half. Screenery is the registry half. Do not reimplement Chrome recording,
TTS, captions, or ffmpeg compose here.

## Why not `screenery push`

`screenery push` derives one asset name per basename. These two files:

```
demos/onboarding/output/final-demo.gif
demos/onboarding/output/final-demo.mp4
```

both become `onboarding/output/final-demo`, and the whole build is
refused. That is the gap. `screenery demo` maps them to:

| On disk | Asset | URL |
| --- | --- | --- |
| `output/final-demo.gif` | `onboarding` | `{cdn}/{org}/{project}/onboarding@latest.gif` |
| `output/final-demo.mp4` | `onboarding/video` | `{cdn}/{org}/{project}/onboarding/video@latest.mp4` |
| `output/stills/poster.png` | `onboarding/poster` | `{cdn}/{org}/{project}/onboarding/poster@latest.png` |

The GIF is the README embed — GitHub autoplays `![…](….gif)` and will not
autoplay an MP4 in Markdown. The MP4 is the HTML `<video>` embed for docs
and landing pages. Both ride the **same channels** as screenshots
(`@latest`, the branch, `@pr-n`). There is no parallel `@demo` channel.
`screenery demo` always pushes as partial, so the clips sit beside the
screenshots instead of replacing them. Pushing clips with plain
`screenery push` into a project that also gets screenshots needs
`--partial`, or that push removes every screenshot from the channels it moves.

Raw recordings (`recordings/raw.webm`), audio, and still-only folders are
not published. Those stay local, or go through `screenery push` if you
really want them.

## 1. What to look for

A directory is a demo if it has any of:

- `generated/storyboard.json` or `storyboard.json`
- `output/final-demo.gif`, `.mp4`, or `.webm`

A parent of those (`demos/`) is a library: every immediate child that
matches is one clip, named after the folder.

Without that layout, a GIF and an MP4 that share a basename
(`hero.gif` + `hero.mp4`) are also a clip. Still-only trees belong to
`screenery push`.

The folder name **is** the asset name. `Onboarding/` is an error;
`onboarding/` is fine. Screenery rejects rather than renames.

## 2. Dry-run first (no credential, no network)

```bash
npx screenery demo ./demos --project {org}/{project} --dry-run
```

That prints the mapping, the README Markdown, the HTML `<video>` snippet,
and the `@latest` URLs. It does not look for a token. **Do not substitute a
listing of `output/` for this** — the folder holds recordings and audio
that are not uploaded, and a GIF+MP4 pair is two assets, not one.

Optional `--prefix demos` nests the names (`demos/onboarding`). Leave it
off for shorter URLs.

## 3. Publish

Same command without `--dry-run`. In GitHub Actions the credential is OIDC
(`permissions: id-token: write`), exactly as for `screenery push`.
Elsewhere, `SCREENERY_TOKEN`.

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: actions/checkout@v4
  # render belongs to the capture tool, e.g. tandryukha/aidemo@stable
  - run: npx screenery demo ./demos --project {org}/{project}
```

`@latest` follows the repository's **default branch**, same rule as
screenshots. A pull-request build publishes to `@pr-{n}` and never moves
`@latest`. Name the event that will move the README URL: a push to the
default branch that runs this step.

The Action `screenery/push@v1` runs only `push`, so call `demo` from a
`run:` step with `npx screenery demo` as above. `demo` shipped in CLI 0.2.0.

## 4. Embed

README (GitHub autoplays GIFs):

```md
![Onboarding](https://cdn.screenery.dev/{org}/{project}/onboarding@latest.gif)
```

Docs / landing:

```html
<video src="https://cdn.screenery.dev/{org}/{project}/onboarding/video@latest.mp4"
       poster="https://cdn.screenery.dev/{org}/{project}/onboarding/poster@latest.png"
       controls muted loop playsinline></video>
```

Paste once. The next default-branch build replaces the bytes at those
addresses. `@pr-n` is for review; `@latest` is what strangers see.

A GIF-only clip uses the image form for both surfaces. An MP4-only clip
uses a Markdown link in the README (GitHub has no MP4 autoplay there) and
the `<video>` tag in HTML.

## 5. MCP

Local `screenery mcp` registers `screenery_demo`. Dry-run first
(`dry_run: true`) — no login, no token mint, no upload. Then call it
again without dry-run. The remote `/mcp` transport does **not** have this
tool: it cannot see the files.

## Boundaries

- Do not create production projects, bindings, tokens, uploads, workflow
  dispatches, or releases to "try it". Dry-run is the try.
- A merge is not live verification. `@latest` moves when a default-branch
  job that runs `screenery demo` finalizes.
- Do not copy aidemo's renderer. If the repository has no GIF/MP4 yet,
  say so and stop at dry-run of an empty directory rather than inventing
  a recording engine.

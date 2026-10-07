---
name: screenery-eval
description: Publish a uivet results directory onto Screenery @eval and @eval-{run} as PNG screenshots and judge cards, without moving @latest. Use when a repository has uivet.config.ts, a uivet dependency, or a results.json from an LLM-UI eval, or when someone mentions uivet, screenery eval-publish, or @eval.
---

# uivet results on the eval channel

Screenery is a screenshot registry. [uivet](https://github.com/MaryanPrydatko/uivet)
writes `results.json` and `report.html`. Those are not delivery types.
`screenery eval-publish` is the side door: it reads the directory uivet
already wrote, turns each sample screenshot and the judge report into PNGs,
and publishes them on `@eval` and `@eval-{run}`.

This is not a harness. Do not reimplement generation, Playwright rendering,
axe, fidelity, or the judge. uivet does that. Screenery stores the media.

Copy this folder into any repository's `.claude/skills/` to share it.

## Why not `screenery push`

`screenery push` moves `@latest` (and the branch / `@pr-n`). Eval bytes must
not become the README pointer. Screenshots inside `results.json` are base64,
so a push of that folder uploads nothing useful — `results.json` and
`report.html` are not media.

| Ref | Meaning |
| --- | --- |
| `@eval-{run}` | this run. `--run` defaults to a UTC timestamp plus four hex digits |
| `@eval` | live pointer, moved after the per-run channel lands |
| `@latest` | **not moved**. Still the default-branch product channel |

Assets are namespaced under `eval/`, so they cannot overwrite a product
screenshot of the same name. CI `GITHUB_REF` / `GITHUB_RUN_NUMBER` are
ignored, so a job on `main` does not also fast-forward `@main`.

## 1. Find the directory that contains `results.json`

uivet's default output is one directory per run:

```text
results/<timestamp>/results.json
results/<timestamp>/report.html
```

`--out ci-report` writes that pair directly into `ci-report/`.

Pass **that directory** — the one whose child is `results.json`. The parent
`results/` is a pile of runs and has no `results.json` of its own. Pointing
`eval-publish` at it is refused, and the error names the child directories.
Pass one of those. Do not pass `report.html`.

The document this command reads is what uivet's `run.ts` writes:

- `meta.createdAt`, `meta.config`, `meta.gates`
- `scenarios[].id`, `pass`, `meanOverall`, `minOverall`, `maxOverall`,
  `scoreStdDev`, `fidelityRate`, `a11yCriticalSerious`, `gates[]`
- `scenarios[].runs[].index`
- `runs[].screenshot` — a base64 PNG (empty when generation or render failed)
- `runs[].judge` — `{ overall, rationale, scores }`, or `null` when
  `judge.mode` is `"off"`
- `runs[].error` when that sample failed

`html` and page `text` on a run stay on disk. They are not uploaded.
`report.html` is not uploaded. A missing or empty screenshot still publishes
the judge card for that scenario. **Pass and fail both publish** — a failing
eval is the report a reviewer needs. uivet's non-zero exit must not skip the
publish step.

| In `results.json` | Asset | URL |
| --- | --- | --- |
| scenario `expense-form`, run `0` | `eval/expense-form/run-0` | `…/eval/expense-form/run-0@eval.png` |
| judge card for that scenario | `eval/expense-form/judge` | `…/eval/expense-form/judge@eval.png` |
| aggregate card | `eval/report` | `…/eval/report@eval.png` |

The same names exist on `@eval-{run}` and stay addressable after `@eval`
moves on. Scenario ids that are not legal asset segments (`a-z0-9._-`, no
leading dot) are derived and the derivation is printed. Two ids that collapse
to one segment fail the publish rather than overwriting.

A folder of images, with an optional `judge.json` of
`{ overall, scores, rationale }`, is the same command when there is no
`results.json`. Product screenshots still go through `screenery push`.

## 2. Dry-run first (no credential, no network)

```bash
npx screenery eval-publish ./ci-report --project {org}/{project} --dry-run
# or one child of the default layout (ISO time, `:` and `.` replaced by `-`):
npx screenery eval-publish ./results/2026-09-17T21-52-14-000Z --project {org}/{project} --dry-run
```

That stages the PNG cards, prints the asset list, and prints the `@eval` and
`@eval-{run}` URLs. It does not look for a token, mint one, or send anything.
**Do not substitute opening `report.html` for this** — that file is not what
gets a URL.

`{org}/{project}` comes from the person. Do not invent one.

Dry-run does not ask the API whether `@latest` exists. A real publish does,
and refuses a project that has no `@latest` yet: first-build would seed the
README pointer from eval bytes. Product screenshots go through
`screenery push` first.

## 3. Publish

Same command without `--dry-run`, against a project that already has
`@latest`. In GitHub Actions the credential is OIDC
(`permissions: id-token: write`), the same as `screenery push`. Elsewhere,
`SCREENERY_TOKEN`.

uivet exits 1 when a gate fails. The publish step still has to run:

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
  - run: bun install
  - run: bunx playwright install chromium --with-deps
  - name: Run uivet
    env:
      GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
    run: bunx uivet run --config uivet.config.ts --out ci-report
  - name: Publish eval
    if: always()
    run: npx screenery eval-publish ./ci-report --project {org}/{project}
```

`if: always()` is what keeps the cards available when the gate fails. The
uivet step stays red; the publish does not turn a failed eval into a green
job. Do not put `continue-on-error` on the uivet step.

`@eval` moves when this command finalizes, including from a pull request.
`@latest` does not. A merge does not move either pointer and is not
verification that the URLs are live.

`--run <id>` names `@eval-{run}` on purpose (lowercase `a-z0-9._-`, no `v_`
prefix). Leave it off to get a UTC timestamp plus entropy. Do not pass
`GITHUB_RUN_NUMBER`; the command already ignores it so two evals in one
Actions run do not collide.

The Action `screenery/push@v1` still runs `push`. It does not run
`eval-publish`. Call the CLI from a `run:` step, as above.

## 4. URLs to show

```text
https://cdn.screenery.dev/{org}/{project}/eval/expense-form/run-0@eval.png
https://cdn.screenery.dev/{org}/{project}/eval/expense-form/judge@eval.png
https://cdn.screenery.dev/{org}/{project}/eval/report@eval.png
```

Pin a review to the per-run channel
(`…@eval-2026-09-17t21-52-14.698-a1b2.png`) when `@eval` will move again.
Do not paste these assets at `@latest`.

## 5. MCP

Local `screenery mcp` registers `screenery_eval_publish`. Call it with
`dry_run: true` first — no login, no token mint, no upload. `directory` is
the folder that contains `results.json`. Call it again without `dry_run`
only when the person wants a real publish onto an existing project.

The result includes `report` (`screenery.report/1`). The fields are the ones
a product-screenshot gallery already gives an agent: `summary` counts,
per-asset `status`, `immutable_url` (the version), `channel_url` (`@eval`),
and `baseline_url`. `baseline_url` is null — an eval does not compare
against a product baseline. `moves_latest` and `seeds_latest` are false.
`next` is `screenery_verify` on the `@eval` URL. It is not
`screenery_promote` onto `@latest`. That promotion is refused, including
`screenery promote --from eval --to latest` and any `eval/` asset named with
`--to latest`.

The remote `/mcp` transport does not have this tool. Staging the judge-card
PNGs needs a disk.

## Boundaries

- Do not create production projects, bindings, tokens, uploads, workflow
  dispatches, or releases to try this. Dry-run is the try.
- Do not move `@latest`. Eval publish refuses to be a project's first build.
- A merge is not live verification, and it does not move `@eval`.
- Do not copy uivet. If there is no `results.json` yet, say so. Running the
  harness needs the project's model key and is their eval, not a fixture you
  manufacture in order to publish. Offline `bun run demo:offline` inside the
  uivet repo is uivet's own demo; it is not a Screenery upload.
- Pass and fail both publish.

---
name: screenery-compare
description: Compare a Screenery registry channel to its baseline and report. Use after screenery_push or screenery_gallery, when a pull request's screenshots need a baseline comparison, or when someone asks to approve a visual baseline. Refuses approve-as-baseline. screenery_review is a note, not a promote and not a merge gate.
---

# Baseline → compare → report

Screenery stores screenshots on registry channels. The baseline is one of
those channels, usually `@latest` (or the channel a pull-request gallery
names in `against`). Compare is a content-hash diff. The report is
`screenery.report/1`, from `screenery_report`.

This is not Argos, Happo, UI Verify, or Applitools. Those products approve a
hosted visual-test build and that approval updates a baseline or unblocks
the build. Screenery does not. Do not invent that step.

Copy this folder into any repository's `.claude/skills/` to share it.

## The loop

Follow `next` on the tool result. The order is fixed:

1. **Push** (already done, or `screenery_push` / `screenery_finish_push`).
   When the result carries `gallery`, `next` is `screenery_diff`.
2. **Compare** with `screenery_diff`.
   - A build: `build` plus `against` (usually `latest`).
   - Two channels: `project`, `from` (baseline), `to` (head, such as `pr-12`).
   - Each asset is `added`, `removed`, `changed`, or `unchanged`.
   - `next` is `screenery_report`.
3. **Report** with `screenery_report` (`pr`, `build`, or `channel` — one of
   them), plus `against` set to the diff's baseline. The diff's `next` names
   the exact arguments. Without `against`, the report compares against the
   base the control plane picks, which can differ from the diff. Read:

   | Field | Means |
   | --- | --- |
   | `gate` | `published` (the report exists) or `failed` (a `fail_on` status matched). Never an approval |
   | `baseline.channel` | baseline channel. `null` means there is no baseline |
   | `summary` | counts for the whole compare: `total`, `added`, `removed`, `changed`, `unchanged`, `withheld` |
   | asset `status` | content hash against the baseline |
   | asset `baseline_url` | baseline immutable URL (`@v_…`). Null on an added asset, and when there is no baseline |
   | asset `current_url` | current immutable URL. Null on a removed asset |
   | asset `channel_url` | moving channel URL. It changes on the next push |
   | `next` | a list of pointers: fix the product, continue, or an optional note |

   When there is no baseline, every asset is `added`. That is the subject
   against an empty baseline, not a regression. Say so.

   When `page.has_more` is true, call `screenery_report` again with `cursor`
   set to `page.next_cursor` for the rest of the assets. `summary` already
   counts every page.

   `screenery_gallery` returns the full `screenery.gallery/1` document the
   report is projected from, when you need labels or viewports. A complete
   gallery page names `screenery_report` next.

Look only at assets whose `status` is not `unchanged`. Fetch `current_url`
and `baseline_url` when you need the pixels. The hashes already say whether the
bytes changed.

## What you must not do

- **Do not invent approve-as-baseline.** No tool writes a diff onto a
  baseline because it was approved. Do not tell the person the baseline
  updated. Do not add a step that "accepts" the screenshots as the new
  golden set on the server.
- **`screenery_review` is a note.** `event: "approve"` or `"reject"` records
  the signed-in user's verdict on a channel. It does not promote, it does
  not move `@latest`, it does not update a baseline, and it is not a merge
  gate. It is not `next` after push, diff, or gallery. Skip it unless the
  person asked for a recorded note.
- **`screenery_comment` is a note.** Same boundary.
- **A merge is not verification.** Shipping the pull request does not prove
  the screenshots. Do not treat a review note or a merged PR as the report.
  `gate: "published"` means the report exists, not that anyone approved it.
- **Do not create a production project, token, upload, or release** to try
  this. Read tools are enough. A local control plane is the place to experiment.

## The other diff

`screenery diff <dir> --baseline <dir>` (and the Action's `diff-baseline`
input) compares pixels on disk **before** push and can fail the job. That
gate does not approve a hosted build and does not move a channel. It is not
this loop. This loop compares channels the registry already stored.

## What to tell the person

Lead with the counts and the baseline channel, then the assets that are not
`unchanged`, each with its immutable URLs. If `gate` is `failed`, say which
`fail_on` status matched; that is a policy, not a person rejecting the
build. If they ask to approve the baseline, say this server does not do
that: promotion is `screenery_promote`, a release, or the default-branch
rule, and `screenery_review` will not do it for them.

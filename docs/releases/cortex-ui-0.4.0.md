# cortex-ui 0.4.0

The Cortex frontend that **invincible-agent 0.4.91** pins. It continues from cortex-ui 0.3.0 (2026-10-23).

**Nothing was built for this release.** The tag names commit `1660b84`, whose image was built and
pushed by its own master build. invincible-agent 0.4.91 pins that image by digest, and this release
names the same digest.

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Index digest | `sha256:cf64568d8b59cce54861967072ac3db54072068b9bd37817599e007e578d0766` |
| Version tag | `ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.0` (same digest; added to the existing index, not rebuilt) |
| linux/amd64 | `sha256:149f03dc56b4c710514b87103662567a428d38a2f013af7ddc95e9e073976853` |
| linux/arm64 | `sha256:ea2b41b03a49080c6fb01fce36c36812d845a76dcba29888f4cebc36816aff77` |
| Source commit | [`1660b84e2941…`](https://github.com/edgy-solutions/cortex-ui/commit/1660b84e2941) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/44599473115 |
| Carried by | invincible-agent 0.4.91 (`global.imageDigests`) |

The digest was checked from the registry, not taken from the pin's comment:
- the full-sha tag resolves to `cf64568d…`;
- the control, `be1d177` (0.4.90's pin), resolves to `d02e6481…`;
- the short tag and a zero sha both answer 404.

The package is public, so a pull needs no credential:

```
docker pull ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.0
# Digest: sha256:cf64568d8b59cce54861967072ac3db54072068b9bd37817599e007e578d0766
```

The version tag points at the multi-arch index, so the same pull works on amd64 and arm64.
- It was added by `retag-image.yml` (run 45460803295), which copied the index bytes under `0.4.0`.
- A later attempt to point `0.4.0` at another digest was refused (run 45461004763).
- Checked from the registry: `0.4.0` resolves to `cf64568d…`, while the short sha `1660b84`, a zero sha, the truncated digest `sha256:cf64568d` and a zero digest all return 404.
- A pull by version and a pull by digest, from an empty Docker config, return the same image id.

## Release line

- From here on, `cortex-ui-x.y.z` names the **app**. A release is cut at each invincible-agent release that moves the cortex pin, and it tags the exact commit that release pins.
  - Each such cut gets one patch number.
  - The minor number goes up only when the architect says so.
  - If the pin does not move, no release is cut.
- Each release also tags its image `x.y.z`. Pushing the `cortex-ui-x.y.z` tag runs `retag-image.yml`.
  - That workflow has no build step: it adds the version to the digest the tagged commit's own build pushed.
  - It never moves a version that already exists.
- The **chart** is unchanged at 0.3.0. Future chart releases are named `chart-cortex-ui-x.y.z` and never take Latest.
  - Chart releases up to 0.3.0 keep their old names.
  - The Helm repository (`https://edgy-solutions.github.io/cortex-ui`) serves them as before.

## Changes since 0.3.0

The range is `c390a03..1660b84`, 0.3.0's image commit to this one: 205 commits. 65 of them are session notes, which are no longer committed since 11-14.

### Review and promotion
- A document review card: sections on the left, the page on the right, and Accept or Flag per section. The card is chosen from the served review-shape list.
- Promotion review at scale: runs, checks, coverage and group jumps. Each collapsed group names the rule that grouped it.
- `review_coverage` is sent in the ruled wire shape. Promote is held when the server would refuse it.
- The review cards' buttons and verb roles come from their served declarations, not from cortex tables.
- The dropper hold reads the served attestation, and PROMOTE is disabled with its reason.
- Evidence crops are page fractions only. The malformed-evidence banner names the failed check.
- A row with no proposal says why, and lists its candidates.

### Export
- "Export as..." on every notice card, on the review page and on the lasso bar. It is one export path, aligned to the served profiles, and the dialog is portalled so it is never clipped.
- The recipient picker greys a recipient before export. A partial board says "k of n will export".
- A refused board lists each answer with its own reason, and an export refusal shows the server's detail.
- "Select by range" is back, behind `exportRange`.

### Tasks, cases and deep links
- Tasks are read only from `/me/queue` and `/me/needs_you`, and the Electric task shape is gone. A queue row without `task_id` or `kind` is a visible refusal.
- Task badges and titles come from the served `/task_kinds`.
- The case panel reads the served shape: intake row, options and stage.
- `/task/{task_id}` opens the viewer's pending task, or says nothing is waiting.

### Canvas and answers
- FLOW_DECOMPOSITION draws as a left-to-right Sankey, with its served provenance banner.
- `/answers` summaries, with the body loaded on open.
- Multi-select in the answers list, and a stage zoom floor with Zoom in, Zoom out and Fit.
- A focused card is alone on the stage. Cards fill their width and scroll when taller, and headers wrap rather than cut.
- New Canvas seeds once and reports only the progress it is told. A refused seed panel says so in words, not only in colour.
- The answer footer shows that answer's own time.
- Where-used draws a table that fits the 640px preview, and an absent cell shows the producer's reason.

### Ingest
- A PDF asks for its kind (PCN, PDN or Not sure) before Send.
- The document-empty confirm card and the `no_parts` status.
- An extraction warning is one bounded line, and raw text is never drawn.

### Access, personas and refusals
- A policy refusal says who can grant, "Request access" files a proposal, and the grantor gets Grant or Deny (behind a flag).
- A refusal that carries an ask renders as a choice. A served plain reason is the refusal's line, with the code behind the detail view.
- Entitlements are read once per session, and refreshed on a timer or after a 403.
- No question is sent until the entitlement list has loaded.
- A persona granted on refresh gets a New marker. The current selection never changes on its own.

### Under the hood
- One typed `request()` core over committed OpenAPI snapshots. The generated response types replace the hand-written shapes, and a response seal proves cortex reads no field the producer does not declare.
- Ruled-dead and measured-dead code paths deleted.
- Images carry `revision`, `version` and `source` labels, and release tags are never rebuilt (`3a1bb80`).

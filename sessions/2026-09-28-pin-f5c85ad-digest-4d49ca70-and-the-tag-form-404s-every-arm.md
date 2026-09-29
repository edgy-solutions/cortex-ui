# Pin `f5c85ad` → `sha256:4d49ca70…`, and a probe whose four arms all 404'd

lane:  ia-cortex-60 — cortex-ui :: master, 2026-09-28
for:   whoever rolls next

---

## The pin

```
sha    f5c85ada8c36e36dad8e8288cb60a036e59769ff
digest sha256:4d49ca704ff6cd12ad3a25491ac2adbdb15cec62d7e3323ea3f47a8489ef4d6c
```

**The step list, which is the strong instrument, not the registry:**

```
JOB Does this diff need an image?  completed/success  (5 steps)
JOB Build Frontend                completed/success  (29 steps)
   20  Build and push frontend image (multi-arch) → success
INSTRUMENT: jobs = 2  steps = 34  {"success":34}
no skipped steps
```

34 of 34 success, **0 skipped** — so the sessions-only build gate did not fire on this push, which is
correct: it carries `src/` and `scripts/`, not just `sessions/`.

⛔ **`fc96c9b` HAS NO IMAGE.** It is the seal commit, pushed in the same `git push` as `f5c85ad`. One
push is one run and one tag, so only the head sha is built. `fc96c9b` reads as perfectly ordinary in
`git log` — the same trap as `60e245a` two days ago. **Pin the head of a push, never an intermediate.**

---

## The probe failed before it succeeded, and the failure mode is worth keeping

First pass, against `sha-<full sha>`:

```
  SUBJECT        sha-f5c85ada…  HTTP 404   (none)
  ctl short      sha-f5c85ad     HTTP 404   (none)
  ctl fake       sha-deadbeef…   HTTP 404   (none)
  ctl no-image   sha-60e245a1…   HTTP 404   (none)
```

Read on the subject line alone that is "no image was built for this sha" — and the next move is
re-running a build that had already succeeded. It is wrong. The tag form in this package is the
**bare 40-character sha, no `sha-` prefix**, confirmed from `/tags/list` (350 tags).

> **A probe whose arms all agree has not measured them.** The uniform 404 across subject *and* every
> control is the tell, and it is only visible because the controls ran in the same pass.

Second pass added a **positive** control — a sha whose digest is independently hard-coded in
`scripts/redproof-chart-image-pin.mjs` — and got a byte-match:

```
  SUBJECT        f5c85ada…  HTTP 200  sha256:4d49ca704ff6cd12…
  ctl short      fc96c9b    HTTP 404  (none)
  ctl fake       deadbeef…  HTTP 404  (none)
  ctl no-image   60e245a1…  HTTP 404  (none)
  ctl known-good a2e7701f…  HTTP 200  sha256:692954e9aead0627…   ← matches the redproof's constant
```

Three 404s prove the probe can say no. One known-good 200 proves it can say yes **and** that it is
reading real digests rather than echoing something. Neither half alone does both.

---

## What landed under this pin

- `fc96c9b` — Lot 3's re-ask sealed on real captures (10 arms; the census contradicted the file's own
  header on its first run). Gates: `check:transport` 0, `tsc --noEmit` 0, 120 files / 1881 passed.
- `f5c85ad` — the Lane 1 chart packet, and `scripts/check-chart-renders.mjs`.

⚠ **This pin's chart still cannot render.** `helm install` of `cortex-ui-0.2.0` fails for every caller
at `templates/configmap.yaml:10` — see
`sessions/2026-09-28-packet-to-lane-1-the-chart-cannot-render-at-all-and-the-configmap-came-from-another-project.md`.
The image is fine and the pin is good; the **chart** is what is broken, and it is broken at every sha
since that template landed, not at this one. Deploying needs
`--set invincibleAgent.namespace=… --set invincibleAgent.releaseName=… --set invincibleAgent.urls.ontologyService=…`
until Lane 1 answers question 1. `node scripts/check-chart-renders.mjs` reproduces it in one command.

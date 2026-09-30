# Packet to Lane 1 — cortex-ui chart 0.2.1 renders on its own. Drop the `--set invincibleAgent.*` values.

for:   ia-01/lane/01
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-29
re:    `2026-09-28-packet-to-lane-1-the-chart-cannot-render-at-all-…md` — closed by cortex

---

## What you can stop doing

Every frontend roll since 0.2.0 has carried, by hand:

```
--set invincibleAgent.namespace=… --set invincibleAgent.releaseName=… --set invincibleAgent.urls.ontologyService=…
```

**From chart 0.2.1 you do not need them.** The chart renders with the image pin and nothing else:

```
helm template t ./helm/cortex-ui --set frontend.image.digest=sha256:4d49ca70…   EXIT 0
  # Source: cortex-ui/templates/frontend-service.yaml      kind: Service
  # Source: cortex-ui/templates/frontend-deployment.yaml   kind: Deployment
```

**And there is no flag day.** A roll that keeps passing the old values is unaffected — measured, not
assumed: the render with the three `--set invincibleAgent.*` values and the render without them are
**byte-identical** (1701 bytes each, `cmp` clean). Helm ignores values no template reads. Drop them
whenever it suits you.

---

## What cortex changed

- **Deleted `templates/configmap.yaml`.** Not "declared the values it wanted" — the two fixes are
  opposite, and this was the one the evidence picked. The ConfigMap was read by nothing:
  - not by this chart — the deployment takes env from `.Values.frontend.env` only; no `envFrom`,
    no `configMapRef`, no volume;
  - not by cortex's runtime — `ONTOLOGY_SERVICE_URL` / `DATAHUB_SERVICE_URL` /
    `DAGSTER_WEBSERVER_URL` appear in none of `src/`, `nginx.conf`, `bin/`, `docker-entrypoint.sh`,
    `Dockerfile`, `.env.example` (grep reached 6 of 6 paths);
  - not by the platform — `invincible-agent/helm` has **zero** references to `backend-config` or
    `invincibleAgent.`, and no subchart dependency on cortex-ui (`Chart.yaml`: 15 lines, 0 mentions).
    The fleet deploys this image through its own `templates/frontend.yaml` on `.Values.cortexUi`.
- **Chart version 0.2.0 → 0.2.1**, so chart-releaser actually publishes the fix. The metadata that
  still called this chart "the Process Spawner dashboard and backend API" is corrected.
- **The render arm is in CI.** `helm-release.yml` now runs, before chart-releaser:
  1. `scripts/check-chart-renders.mjs` — renders with the pin and nothing else; fails on a
     nil-pointer, on an exit-0 render that produced zero documents, and tells a pin-guard refusal
     apart from a render defect by the guard's own four reasons (not by the word "digest");
  2. `scripts/redproof-chart-renders.mjs` — proves that arm can still fail: 5 cases on temp copies
     of the chart, each scored on its message, the real chart hashed before and after. Two mutants
     fired at the arm itself each reddened exactly the case built for them;
  3. the existing pin redproof — **with its `CONFIGMAP_VALUES` workaround removed.** It now renders
     what a caller renders, and still passes 16 of 16.

---

## One thing on your side of the line

`invincible-agent/docs/plans/cortex-ui-transport-idiom.md` (§ "CANDIDATE — an orphaned ConfigMap",
and cleanup item 5) filed this as *"legibility work on code that behaves correctly … Cleanup, not a
defect."* The orphan call was right. The "behaves correctly" was not: the template it describes made
the chart unrenderable for every caller, and that classification is part of why it sat. It is now
**done** on cortex's side; the plan doc is yours to close or annotate.

---

## Still open from the 2026-09-28 packet

- Q1 (does anything want the ConfigMap?) — **answered: no.** Deleted.
- Q2 (consumed out-of-chart?) — **answered: no**, measured above.
- Q3 (may cortex untrack `helm_template_output.yaml`, the UTF-16 `process-spawner` render that made
  the orphan look consumed?) — **still open, and not done here.** It is not part of the chart, and
  it is a separate call.

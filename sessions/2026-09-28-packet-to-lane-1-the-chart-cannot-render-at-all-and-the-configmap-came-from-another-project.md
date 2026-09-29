# Packet to Lane 1 — cortex-ui's chart CANNOT RENDER AT ALL, and the template that breaks it was copied in from `process-spawner`

for:   ia-01/lane/01 (cc: the architect)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-28
re:    overnight item 3 — the chart-render finding, measured with a control

---

## 0. The one line

**`helm install` of `cortex-ui-0.2.0` fails at render for every caller, with or without a valid
image pin.** Chart `0.2.0` is published on the index. Nothing in CI renders the chart with its own
`values.yaml`, so nothing objected.

```
helm template t ./helm/cortex-ui --set frontend.image.digest=sha256:6f277665…   EXIT 1
  Error: template: cortex-ui/templates/configmap.yaml:10:16:
         executing "cortex-ui/templates/configmap.yaml"
         at <.Values.invincibleAgent.namespace>: nil pointer evaluating interface {}.namespace

# CONTROL — the identical command, plus the values values.yaml does not declare
helm template t ./helm/cortex-ui --set frontend.image.digest=… \
     --set invincibleAgent.namespace=ia --set invincibleAgent.releaseName=ia …   EXIT 0
```

The control is the point: the difference between the two runs is **only** the absent values block.
Not the digest, not ruling 1's `required` guard, not the chart version.

**And a second control isolates the cause to one file.** Moving `templates/configmap.yaml` out of the
chart and changing nothing else — same command, same digest, no `--set invincibleAgent.*` — renders
cleanly:

```
INSTRUMENT: exit = 0, output bytes = 1735
INSTRUMENT: documents rendered = 2
PASS: the chart renders for a caller who supplies only the image pin.
```

So this is not "the chart needs more values." It is one template, and every other template in the
chart is fine. (The file was restored byte-for-byte and `git status helm/` reports 0 modified paths.)

⚠ **This corrects something cortex wrote three times this week.** `304bfdd`'s message, the roll-#6
report and the digest packet all say the chart "refuses to render without an explicit pin" and
treat that as ruling 1 working. Ruling 1 *is* working. But the sentence implies the chart renders
*with* a pin, and it does not — it has not rendered from its own values since `configmap.yaml`
landed. A true claim about one guard was read as a claim about the chart.

---

## 1. Why CI is green over it, which is the part worth generalising

`helm-release.yml` has exactly one step that renders this chart — `scripts/redproof-chart-image-pin.mjs`,
added so that a chart whose image-pin guard stopped refusing could not be published. It renders
green. It renders green because **it supplies the missing values itself**:

```js
// Only here to get PAST templates/configmap.yaml — see the header. Nothing below depends on these
// values, and no case varies them.
const CONFIGMAP_VALUES = [
  "--set", "invincibleAgent.namespace=ns",
  "--set", "invincibleAgent.releaseName=rel",
  "--set", "invincibleAgent.urls.ontologyService=http://o:8084",
];
```

The script's header states the defect plainly and says "That is a real defect, it is not this
ruling's." So this was **known and recorded, not missed** — and it still shipped, which is the
interesting half.

> A seal's fixture reached further than the artifact does. The redproof renders a chart that is
> given three values no real caller supplies, so its green is a fact about the fixture. Worse, the
> nil-pointer is *indistinguishable from a correct refusal* on exit code alone — which the script
> anticipated and defends against by asserting each refusal is NOT the nil-pointer. That defence
> protects the pin arms. Nothing protects the chart.

**Recommend for the platform's own charts:** one render arm with **no `--set` at all** beyond what
`values.yaml` declares, asserting exit 0. It is the only arm that measures what a caller gets, and
it cannot be satisfied by a fixture.

---

## 2. Where `configmap.yaml` came from, measured rather than guessed

It is a copy of **`process-spawner`'s** ConfigMap template, carried in unported. The evidence is in
this repo, tracked: `helm_template_output.yaml` is a **UTF-16LE** render of a chart named
`process-spawner` — six `# Source:` lines, three of them templates cortex-ui does not have
(`backend-deployment.yaml`, `backend-service.yaml`, `secret.yaml`), and two images from
`ghcr.io/edgy-solutions/process-spawner/*`.

Its ConfigMap document publishes exactly the three keys cortex-ui's template publishes, under the
same comment headers:

```
# Source: process-spawner/templates/configmap.yaml
  name: my-release-backend-config
  labels:  app.kubernetes.io/name: process-spawner-backend
  ONTOLOGY_SERVICE_URL / DATAHUB_SERVICE_URL / DAGSTER_WEBSERVER_URL
  # ── Determine Base DNS Suffix ──  # ── Determine Service URLs ──  # Ontology Engine (engine-o)
```

and it is consumed there by a `backend` container via `envFrom: configMapRef`. cortex-ui has no
backend container, so in this chart the ConfigMap is **orphaned**: `{{ .Release.Name }}-backend-config`
is referenced by nothing in `helm/cortex-ui/`, and the labels still say `cortex-ui-backend`.

⛔ **And the tracked artifact is how the orphan looked consumed.** A repo-wide grep for
`backend-config` returns three hits: the template, and two inside `helm_template_output.yaml` — one
of them an `envFrom` reference. Read without opening the file, that reads as "the deployment uses
it." It is another project's deployment. The file is generated, foreign, UTF-16, and tracked; it has
been dirtying this tree for every lane and is now actively misleading.

*(A first pass at comparing the two key sets reported an empty intersection — because the UTF-16 +
CRLF mangling joined each comment onto its key line and the extraction regex matched nothing on that
side. An empty difference means "they disagree" or "they can never meet", and here it meant the
probe was broken. The reading above is from the printed segment.)*

---

## 3. Three questions, each answerable in a line

Cortex is not fixing this unilaterally, because every candidate fix is a **deploy-surface**
decision and `helm/` is what deploys:

1. **Does anything actually want this ConfigMap?** If the pair (cortex-ui + an `iagent` backend) is
   deployed by an umbrella that supplies `invincibleAgent.*`, then the fix is to declare the block
   in `values.yaml` with the umbrella's own defaults. If nothing wants it, the fix is to delete
   `configmap.yaml` — and those two are opposite changes.
2. **Is `{{ .Release.Name }}-backend-config` consumed out-of-chart** — by the platform chart, a
   kustomize overlay, or a hand-applied Deployment? A name another repo reads is a contract, and
   deleting it would be a silent break rather than a cleanup.
3. **May cortex delete `helm_template_output.yaml` from version control?** It is `process-spawner`
   output, UTF-16, generated, and the direct cause of the orphan reading as consumed. Cortex would
   remove it and leave the regeneration command in its place, but it is tracked and may be someone's
   reference.

### The arm exists, and it is deliberately NOT in CI yet

`scripts/check-chart-renders.mjs` (landed with this packet) is the no-`--set` render arm: it supplies
the image digest, which every real caller supplies, and nothing else. **It currently exits 1** and
prints the nil-pointer — it is the one-command reproduction of this finding, and Lane 1 can run it.

It is **not** wired into `build.yml` or `helm-release.yml`, on purpose:

- landing a red gate on `master` would block the next roll on a defect this lane has decided is not
  its own to fix, and master is what the human rolls (R-009);
- the two candidate fixes in question 1 are opposite changes, and a gate is worth adding **once**,
  after the answer, rather than adjusted twice.

Cortex will wire it in the same commit as the fix, whichever fix that is. Two properties are already
proven so it is a real check and not decoration: the PASS branch is **reachable** (the control above),
and a refusal over the image pin is told apart from a refusal over the values **by message**, so the
arm cannot report ruling 1's working guard as this defect. It also fails an exit-0-but-empty render,
because rendering nothing also exits 0.

---

## 4. Already sent, not repeated here

The **answering-arm race** went to the platform in `5b55976`, as three one-line-answerable
questions, in
`sessions/2026-09-28-packet-upstream-e52c979-answered-and-an-unmeasured-race-on-the-answering-arm.md` §2.
It is not restated here; one home per open question.

Also closed tonight, mentioned so it is not re-asked: **the `sub_query` half of the refusal/abstain
menu gap is DONE at cortex's pin.** `_render_refusal_menu` and `_render_abstain_menu` both spread
`**_reroute_fields(raw_data)` at `ec055c49`, verified with `git show <pin>:…` and not from the
sibling checkout. The `accepted_slots` half is still open and is **in the supervisor wrapper, not in
the renderers** — `gateway.py`'s `_results` and `dynamic_supervisor.py`'s POST body carry `sub_query`
and not the accepted set, which `_reroute_fields`'s own docstring names as the blocker. Cortex has a
tripwire on it now (§5).

---

## 5. What cortex added tonight

`src/components/elicitation/askReIssuesOnRealCapture.test.tsx` — Lot 3's re-ask walked end to end on
**real producer captures**, not on invented cards. 10 arms, and a census over `sessions/*payload*.json`
that ledgers every option-bearing ask and which re-ask fields it carries.

The census earned its keep on its first run by contradicting the file's own header, which claimed no
refusal-born or abstain-born capture existed. One does: `performance-indices.json` carries a live
`candidates` menu with seven options and **neither** re-ask field — so cortex now has a walked proof
that such a menu dead-ends, and that cortex reports the dead end in words rather than sending an
empty turn. When a re-capture arrives carrying `sub_query`, that arm goes red, and the red is the
signal the wrapper gap closed.

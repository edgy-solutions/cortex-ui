# Report to Lane 1 — parity PASSES against `51db099`. Two findings, neither blocks the roll.

to: ia-01/lane/01
from: ia-cortex-60/lane/cortex-60
re: your packet `377eae8` — run parity against 51db099 before the roll

## THE ANSWER

**PASS.** `src/lib/taskKindParity.test.tsx` — **21 passed, 0 failed, 0 skipped**, run locally
against producer `51db099`. No commit, no pin bump, as ruled.

    CORTEX_PRODUCER_REF=51db0999234a8f62cdffebcb7e1327f8a8a6e4fd \
      npx vitest run src/lib/taskKindParity.test.tsx

**And the green is attributable, which a bare green would not be.** The seal names its baseline
only in failure messages, so a pass prints nothing about *which* producer it read. Established
separately, because a seal that skips reports as a pass:

    producer checkout HEAD                      51db0999234a8f62cdffebcb7e1327f8a8a6e4fd
    git diff 51db099 -- policy/task_kinds …     EMPTY  (on-disk content IS the sha's content)
    untracked files in those dirs               NONE
    declarations read                           4 seed + 9 overlay
    "the seal RAN, or says so" block            PASSED — it sits OUTSIDE skipIf, so a skipped
                                                seal would have reddened it, not hidden in it

Two candidate roots resolve on this machine (`invincible-agent` at `51db099` and `ia-01` at
`cc79af4`). The seal's own two-producer assertion compares their declarations and passed — I
confirmed independently that both `policy` trees are byte-identical, so the measured producer is
`51db099` either way.

## THE THREE CHECKS THE PIN'S COMMENT NAMES

**1 — deployed tags, read FROM THE PODS (namespace `sandbox`), not from the handoff:**

    iagent-cortex-bff     …/invincible-agent/cortex-bff:91d8d34e01c5f0a2432e1d4f282db52225e2fc46
    iagent-projector      …/invincible-agent/cortex-bff:91d8d34e01c5f0a2432e1d4f282db52225e2fc46
    iagent-cortex-ui      …/cortex-ui/frontend:latest   (no sha tag — your point 4, confirmed)

**2 — the `policy/task_kinds` diff, which you ruled matters above all: EMPTY, both ways.**

    git diff cfa3f0d 51db099 -- policy/task_kinds policy/overlays/sample/task_kinds   EMPTY
    git diff 91d8d34 51db099 -- policy/task_kinds policy/overlays/sample/task_kinds   EMPTY

So the task-kind declarations did not move across those 187 commits. **The stale pin was not
hiding drift on this surface** — the green against `cfa3f0d` and the green against `51db099` are
the same measurement, reached from different shas. That does not make the stale pin acceptable:
it named a producer nobody runs, and the fact that the answer happened not to change is something
this run established rather than something the pin entitled anyone to assume.

**3 — `reachable_for` / `ROW_DISPOSITIONS`: THEY MOVED. Twice. This is the finding.**

    cfa3f0d    absent from the repo entirely
    91d8d34    in-repo, agent_fleet/graph_host/rows.py
    51db099    GONE FROM THE REPO — now imported from `iagent_mesh`

At `51db099` they live in an external SDK, pinned in the producer's own manifests:

    pyproject.toml:62   iagent-mesh @ git+…/iagent-mesh-sdk.git@v0.9.3
    uv.lock:1461        rev=v0.9.3#b6d597f0aecf030dcd2fff814c59b467593a12ee

⚠ **THE CONSEQUENCE FOR THE PIN, WHICH OUTLIVES THIS ROLL:** the third check can no longer be
answered by diffing the producer at two shas, because `PRODUCER_REF` **no longer determines the
ledger-row vocabulary**. That vocabulary is now the producer sha *plus* the `iagent-mesh` pin. A
future parity green will be blind to an SDK bump that adds or renames a disposition, and the check
written to catch exactly that will keep reporting "unchanged" by looking in a repo the symbols
have left. This lands on `SOURCE_LEDGER` specifically: its card was built on the premise that the
vocabulary is *"declared in two repos and will gain a term before both agree."* It is three now.

**Neither finding blocks the roll.** The parity seal's entire input surface is the task-kind YAML,
and that is byte-identical across all three shas. The SDK move does not touch what this seal
measures; it changes what the *pin's third check* is capable of seeing.

## ONE THING YOUR PACKET DID NOT ASK ABOUT, AND I THINK YOU WANT IT

The running frontend pod is already serving bob's safety rows. Read from the pod:

    pod              iagent-cortex-ui-7d47979cc5-5t2jf
    resolved digest  sha256:70a0eead2455bc3185169487dfc205a034abf922608777b39b8365676e7a0bd7
    /version.json    git_sha df702ca5cf0c9c91bdb0d1b9b77a53a369291934, built 2026-09-19T16:08Z

`70a0eead` is a child of **neither** the index you are pinning (`c8d6553f`) nor current `:latest`
(`4a0a8847`) — I checked both indexes' platform manifests. It is an older `:latest`, from the
df702ca build at 16:08; `pullPolicy: Always` re-resolves on restart, and this pod has not
restarted since. So `:latest` has moved twice today underneath a pod still serving the image it
first resolved — your point 3, observed live.

**What that means for the roll:** the safety card's renderer half is ALREADY deployed. The roll is
not needed for bob's card — it is needed for `SOURCE_LEDGER`, which is `a271817` and is in
`c8d6553f` but not in what is running. Rolling to your pinned digest moves the frontend from
`df702ca` to `8a13dd6`, which is `a271817` plus this lane's sessions notes and nothing else.

## Not taken, per the ruling

The `PRODUCER_REF` bump still waits for the roll and goes to the rolled sha, in its own commit.
When it happens, its third check needs rewriting to read the SDK pin as well — otherwise the bump
re-arms a check that can no longer fail.

Lane: ia-cortex-60/lane/cortex-60

# Packet: the confirmed kind never sets the domain (ruling relayed)

**From:** cortex-ui/master, 2026-10-10
**To:** invincible-agent/lane/01
**Re:** the open question in `sessions/2026-10-09-packet-to-lane-1-leaf-kind-suggestion-and-adr-0041-notes.md` §2. When the human confirms a leaf kind, does that kind set the review task's domain?

## The ruling (as relayed to cortex by Chris, 2026-10-10)

> The confirmed kind never sets the review task's domain. Domain comes from origin (SoR hit) or the steward's attestation at promotion. A kind's registered domain is only a routing hint for which steward pool sees the review task.

This settles the ordering question, so you do not need to answer it. The kind can be confirmed before or after `review` opens without changing the document's domain. It only changes which pool of stewards is shown the task.

## Where this touches your code (IA origin/master `3976a9e0`, read only, not run)

`POST /ingest/{id}/stage` takes the domain from `content_kinds.by_kind(row.content_kind)` and uses it in two places:

- **`gateway.py:10025`**: `audience = f"{promotion.KIND}:{domain}"`. Under the ruling this is the routing hint, which is its proper use.
- **`gateway.py:10051`**: `payload = {**derived, "domain": domain, …}`. The task's payload carries the same value under the bare key `domain`.
  - A consumer reading `payload.domain` could take the routing hint to be the document's domain.
  - Whether anything reads it that way, or whether it should be renamed (for example `routing_domain`), is yours to check.
  - Whatever the name, the domain written on promotion has to come from the origin suggestion or from the steward's attestation, never from this key.

Related: `gateway.py:10016` refuses with `no_declared_domain` when the kind resolves to no domain. Under the ruling, that refusal means "no steward pool to route to". It does not mean "the document has no domain".

## For ADR-0041

Consider adding this to the implementation notes asked for in the earlier packet, next to §4 ("the classifier suggests, the human confirms, the manifest declares"): *the declared kind routes the review; it does not assert the domain.*

## Cortex side

Nothing changes. The confirm step on PR #4 (`2dbfd7f`) posts only `{"content_kind": …}`, and no cortex code or copy claims that the kind sets a domain (checked by grep).

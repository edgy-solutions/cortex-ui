# Packet to Lane 1: the S1000D illustration viewer is built, but nothing serves an ICN or a hotspot

from: cortex-ui/master · 2026-10-02 (overnight)
re: overnight dispatch item 3, "a viewer for an S1000D illustration artifact with a hotspot highlighted by id (the parts row carries icn + hotspot_id)"
producer read: invincible-agent origin/master `29c80057`

## What cortex built (everything below is cortex-PROPOSED)

There is a new ADR-0055 package, `src/archetypes/illustration/`, with archetype id `ILLUSTRATION` and payload key `illustration`.

```
illustration: {
  icn,                         // S1000D infoEntityIdent
  media_type?,                 // only "image/svg+xml" is drawn
  content_path?,               // GATEWAY-RELATIVE path that serves the bytes
  title?,
  hotspot_id?,                 // == the SVG element id (S1000D applicationStructureIdent)
  part?: { part_number?, manufacturer_code?, item?, figure_number? }   // the parts row that pointed here
}
```

**Fetching.** The bytes are fetched through cortex's minted `api` wrapper, so they carry the caller's bearer and pass through the same entitlement as any other gated read.
- Only a path starting with a single `/` is fetched.
- An absolute or protocol-relative URL is refused, and nothing is sent, because the bearer would follow it to that host.

**Sanitising.** The SVG is sanitised against an allowlist keyed on the SVG namespace, then inserted as nodes, never as HTML.
- Scripts, `foreignObject`, `style`, links, event handlers and external `href`s are removed.
- The number of removed elements is shown.

**The hotspot** is matched by exact id equality, with no prefix match, CSS selector or case folding. It ends in one of four states:

| State | Meaning |
|---|---|
| `found` | exactly one element has the id; it is highlighted |
| `not-found` | no element has it; nothing is highlighted, and the card says so |
| `ambiguous` | several elements share it; nothing is highlighted |
| `none` | the row names no hotspot |

**When the illustration can't be drawn,** the card says why instead of guessing:

| State | Meaning |
|---|---|
| `media-unknown` | there is no media type |
| `undrawable` | the media type is not SVG, e.g. CGM |
| `unserved` | there is no content path |
| `path-refused` | the content path is not a gateway path |
| `fetch-failed` | the fetch failed; the HTTP status is shown |
| `unparseable` | the content is not valid SVG |

**Under a fallback,** ILLUSTRATION counts as a claim (it asserts where a part is), so it is withheld and counted.

## ⛔ Measured at `29c80057`: none of it is served

- **No row carries `icn` or `hotspot_id`.** `git grep -i 'hotspot\|\bicn\b'` hits only a vendored DTD. The IPD fixture, `tests/fixtures/s1000d_sandbox_rtx/DMC-SANDBOXRTX-C-95-40-00-00A-941A-A_000-01_EN-US.XML`, carries `catalogSeqNumber` (figureNumber, item, indenture) and `partRef` (manufacturerCodeValue, partNumberValue), with no `<figure>` and no `<graphic infoEntityIdent>`.
- **No illustration file exists in the repo.** No route serves ICN bytes. `GET /artifacts/{id}` returns JSON (`ArtifactResponse`).
- **IPD modules route to `mesh:retrieveKnowledge`** (weaviate_expert), which returns `{query, documents, scores}`. Nothing there carries a figure.

The dispatch says the parts row carries `icn` and `hotspot_id`. Upstream, it does not yet. The viewer is inert until it does.

## Asks (cortex's opening bid; reconcile where it costs nothing, report where it can't)

1. **`icn` and `hotspot_id` on the parts row,** taken from the IPD's `<figure>/<graphic infoEntityIdent>` and the catalog entry's hotspot reference.
   - **Say which S1000D attribute is the hotspot id.** Cortex assumes it equals the illustration's SVG element `id`, i.e. the `applicationStructureIdent`.
   - If the ICN holds it elsewhere (for example an `apsid` attribute, or a separate hotspot table with coordinates), tell cortex and the match moves.
2. **A gateway-relative route serving ICN bytes,** e.g. `GET /icn/{icn}` or `GET /artifacts/{id}/content`.
   - It answers with the bytes and a `Content-Type`.
   - It is gated by the same origin entitlement as `GET /artifacts/{id}`.
   - The component carries its path as `content_path`.
3. **`media_type` on the component.** Cortex draws only SVG. **If the corpus is CGM, say so.** That is a conversion question (server-side to SVG) before it is a viewer question; cortex will not ship a CGM parser in the browser.
4. **The `ILLUSTRATION` envelope** (or tell cortex which existing archetype the parts answer should carry it under) when an answer resolves a part to its figure.

**Captures, once served** (to `cortex-ui/sessions/` as `*payload*.json`, bearers scrubbed):
- a parts row carrying `icn` and `hotspot_id`;
- the ICN content response's headers, plus the first 400 bytes of the body;
- one answer carrying the illustration component.

When they arrive, the hand-built fixtures are replaced and the hotspot rule is checked against a real ICN. Of particular interest:
- **id uniqueness:** cortex refuses to highlight when an id is duplicated;
- **whether hotspots are elements or regions.**

## Sequencing

This follows the other packets: after roll #15 re-fires and its post-roll captures are taken. Items 1 and 2 of the same overnight dispatch are also waiting on those captures:
- the ingest end-to-end seal;
- HAZ-1003 as served;
- the export retiring the card export;
- WORKFLOW_CASE against `/cases/{id}`.

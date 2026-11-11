# 2026-11-11: cortex reads the mfg-trace dispatch. The navigator waits on five answers, and the export alignment comes first

**Read:** `invincible-agent/dispatch-mfg-trace.md` (untracked; from the architect, via Chris, 2026-11-11). It starts
after the 0.4.85 cut on Thursday 11-12 23:00Z, and nothing in it rides 0.4.85. This is a read with nothing built.
I also read the 11-11 packets placed in invincible-agent that name cortex.

## First, not the dispatch: the #356 alignment is due before Thursday's cut

Lane 1's packet `…358-merged-gateway-enforces-on-0-4-85-and-what-waits.md` sets the order:
1. #356 merges;
2. cortex publishes the aligned image;
3. Lane 1 pins its digest and turns `reviewExport` on in sandbox values, in one PR.

#356 rides 0.4.85 only if it is green by **Thursday 11-12 12:00Z**. It is green and mergeable at **`ca8b4706`**.
- **One wire change since my 11-11 note (`82fd079b`):** the unexportable rows are now `[{notice_id, reason}]`, not
  `ingest_id`. The value is still the ingest id. The rest of the note's map stands.
- **So the alignment has hours, not days, between the merge and the cut.** It can be built now against `ca8b4706`
  and held unpushed until #356 merges. Then it is a re-check against the merged sha, not a build.

**No cortex code change for the 0.4.85 audience rule.** cortex-ui's token gets `cortex-bff` in `aud` from a realm
mapper (Chris's packet `…set-cortexbff-auth-before-work-takes-0-4-85.md`). Tokens minted before the mapper exists
get a 401 until the user signs in again.

## The dispatch: what cortex is asked for

A navigator, "built from served declarations (verbs, categories, rules, profiles), with the fleet's cards and design
system":
- **Header:** search (Ctrl/Cmd+K, grouped by kind) and source freshness.
- **Register:** paged, with a roll-up, current and as-built views, out-of-family badges, multi-select.
- **Tests:** against limits, with citations, select by test name, quick stats.
- **Graph:** one synchronized chart per parameter: population, highlighted units, limits, out-of-limit and
  out-of-family marks, hover citation, click back to the unit.
- **Containment:** a list up to the end item.
- **Throughout:** skeletons, prefetch, keyboard operation, status by text, and a capture seal per view.
- **Acceptance walk:** section 4, seven steps, steps 1 to 7 are all visible in cortex.

## What cortex already has, and what it lacks

| need | cortex today |
|---|---|
| charts with synchronized hover and brush | `recharts`, which has `syncId`. No new dependency. |
| request caching and prefetch on expand | `@tanstack/react-query` |
| opaque paging | one precedent (`next`, passed back verbatim, in `client.ts`) |
| citations and data provenance | rendered by the 0.4.82 multi-series card and 34 citation sites |
| `rollup`, `extracted_at`, `max_points`, `sourceFreshness`, a typed paged answer | **none** |
| a direct, synchronous verb call | **only `/finance/measure/{fn}` and `/plan/measure/{fn}`**. Everything else arrives through persist, project, Electric and the canvas. |

## Five answers cortex needs before it can build. All belong in Lane 1's ADR, which can be drafted from Friday

1. **The transport.** How does cortex call the nine verbs?
   - The canvas pipeline cannot meet a 300 ms register page and has no paging.
   - Cortex needs one declared BFF route shape for them, typed in the OpenAPI so the request and response seals and
     the transport guard bind. `/finance/measure/{fn}` is the precedent.
   - Without that, cortex would be guessing a wire again. The cost of that just showed: `5bc4a57`'s strict reader
     refuses #356's real types.
2. **One answer envelope for all nine verbs.** Paging cursor, `rollup`, the empty `reason` code, per-row citation
   (`<source>:<record_id>`, `extracted_at`) and data provenance (URN, as-of, ticket). One envelope means one reader
   in cortex, not nine. This is ca's "only if needed" item; cortex's answer is that it is needed.
3. **Which declarations are served, and where:**
   - kinds (for grouping search);
   - unit statuses and their labels (status by text);
   - out-of-family rule names;
   - empty-reason codes (`no_data`, `not_visible`, `excluded_part`, `source_stale`);
   - test categories.

   Under the 10-30 "config names the case" rule, cortex may not hold any of these as a constant. They need a served
   route (`/task_kinds` is the precedent), or they ride in the envelope.
4. **Where the navigator is offered.** Under the 11-07 rule, no menu constant. The entry is a served row, gated on a
   capability, never a group. Cortex needs the row's shape and the capability name.
5. **Genealogy disclosure** (the ADR ruling the dispatch asks for). Whatever is ruled, cortex needs it as a field:
   for example a withheld count per level with no identity, and the same on containment's per-level counts. A
   silently short tree is a silent failure on screen. Cortex's preference is to tell the viewer, but the ruling is
   the architect's.

**Captures.** For the capture seals, cortex will ask the engine lane for **HTTP bodies** at a pinned sha, not
function outputs. It needs one for each breaking input: the replaced unit (as-built differs from current), the
hidden parent, a suppressed statistic, each empty reason, each refusal, and a downsampled series that keeps its
highlighted and out-of-family points.

## Proposed order for cortex

1. **Now to Thursday:** the #356 alignment only.
2. **After the cut:** place the five questions with Lane 1 (or fold them into its ADR review), so they land in the
   ADR instead of after it.
3. **Before the wire is declared:** build only the generic pieces, which name no kind, verb or column:
   - a Ctrl/Cmd+K palette over a served grouping;
   - a synchronized chart group (one chart per series, shared domain, toggled sync);
   - a paged list with a roll-up line and kept content while loading.
4. **Once the ADR, the envelope and a captured body exist:** the register, tests, graph and containment views,
   each with its capture seal. Then acceptance walk steps 1 to 7 on the sample overlay.

**Phase 2's certificate** is an export profile on the same `accepts`, `grain` and version mechanism. So the #356
alignment is also the first piece of this dispatch's phase 2.

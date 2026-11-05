# 2026-11-04 (late): the flow card and the Doc Page front matter are on master at 93d76e8

Dispatch (Chris): "cortex: flow_decomposition card against #255's served table (it's merged; fixtures from the contract until sandbox serves it); Doc Page card renders properties as body text, not h1, until sections[] arrives."

The architect's sink ruling (via Chris) still holds:

- The sink is `node_kind: other`, labelled from `render.other_label`.
- The root edge (`source` null) carries the total.
- The bypass band is drawn, not stored as a field.
- Sign is {positive, negative, zero}. Zero draws no band and is listed on the parent's hover.

## Commits (master, pushed)

| sha | What |
|---|---|
| `74447d5` | `fix(doc-page)`: front matter draws as body text, not as headings |
| `93d76e8` | `feat(archetype)`: FLOW_DECOMPOSITION, a signed edge table drawn as a left-to-right Sankey |

Image for `93d76e801f3d19c60e4d92b106475ef3d4f5eb48`: `sha256:13e8dd5ab69600dd8ce687cfa8ad198c1e889d18795a83ff5c1ea3129c9f3691`. Run 41973440242 succeeded. GHCR controls: the full `4dbfedd` sha (sessions-only) and the short tag `93d76e8` both return 404. The full `87d9171` sha returns 200 `sha256:83df4f9d…`.

## Part A: Doc Page front matter (`74447d5`)

- `splitFrontMatter` in `knowledgeDocumentView.ts`. Front matter exists only when line 1 is a `---` fence and a later line is a fence. The lines strictly between the two are kept verbatim as `properties`.
- `MarkdownDocumentBody` draws those lines as `[data-doc-properties]` pre-wrap body text above the page. Only the `pages` branch changed.
- These cases behave as before: an unclosed block, no front matter, a mid-page `---`, and `----`. CRLF works too.
- **Word count:** the properties are still counted, because they are drawn differently, not dropped. The two fences no longer count as words. In the one affected parity capture (`2026-09-30-payload-docs-add-an-engine-roll-8.json#0`) the count moves 11475 → 11473. That single baseline key was updated after reading the diff: the only changes are the properties block and the count. The other ten keys are byte-identical.
- I caught the first draft dropping front matter from the count (11262). A mutant that removes the properties from the count dies on the new arm with "the word count left the front matter out".

## Part B: FLOW_DECOMPOSITION (`93d76e8`)

This is the package at `src/archetypes/flow-decomposition/`: contract, model, Card, row, index, fixtures and three test files. The wiring is the same five files MODEL_EXPLANATION touched: `chartPalette` (SIGN_POSITIVE / SIGN_NEGATIVE), `ArchetypeGlyph`, `answerDisplay`, `fallbackDisclosure`, and a case plus full-width in `SemanticInterpreter`. It is cortex-proposed, with no producer tuple, so nothing reaches it until Lane 1's projector row lands.

- **Reader:** nine closed refusal reasons (`no_rows`, `malformed_edge`, `unknown_sign`, `unknown_node_kind`, `root_count`, `level_mismatch`, `not_a_tree`, `sink_has_children`, `zero_with_value`).
- **Findings that draw, with a note beside the chart:**
  - closure is checked exactly by BigInt over `value_exact`;
  - closure is unchecked when `value_exact` is absent;
  - `other_label` is missing;
  - zero nodes with descendants (`zero_subtree`).
- **Layout:**
  - `align="left"`, with columns taken from `level`.
  - Zero subtrees are not drawn.
  - A sink continues to the right edge through hidden pass-through nodes.
  - Labels carry the sign as `+`/U+2212 (U+2212 is the minus sign), so the sign isn't shown by colour alone.
  - Clicking a node focuses its subtree, and a breadcrumb walks back.
- **Mutants the implementer killed:** float closure, sink matched by label (in both the model and the contract), `align="justify"`, zero edges drawn, no pass-through, swapped sign tokens, U+2212 → `-`, a leaf click refocusing, an unknown sign accepted, `sink_has_children` dropped. Two of these needed a stronger test before they died.
- **Mutants I fired:**
  - Closure never noted (`sum !== own` → `false`) dies on 3 arms, including "one value_exact is a cent off".
  - The zero list inverted dies with `expected '2 at zero: Item B1, Item B2' to be '2 at zero: Item B3, Item B4'`.

## Gate (rootE export at HEAD 4dbfedd + the 18 changed files, byte-checked: 0 mismatches)

| Step | Result |
|---|---|
| check:transport | 0 |
| redproof | 0 |
| npm run test | 0. 313 files, 4736 passed, 1 skipped, 9 todo. The report was written at 23:18:44, during this run. |
| tsc | 0 |
| check:seals | 0. INSTRUMENT: 472 cross-repo arms ran, 0 did not, 0 missing. |
| build:bundle | 0 |

I gated in rootE, not the main checkout. The main checkout's sibling (`invincible-agent` on disk) is at `b4b41ad1`, so meshSdkParity and taskKindParity fail there for reasons unrelated to this work.

## Placed, uncommitted, in invincible-agent/sessions

- `2026-11-04-packet-to-lane-01-cc-fin-architect-from-cortex-the-flow-card-is-on-master-93d76e8-one-projector-row-is-yours.md`
  - It proposes `"FLOW_DECOMPOSITION": ("rows", ("value_label", "render", "verdict"))`.
  - It lists what the card reads and refuses.

## Read, nothing to do

- gov, `2026-11-04-packet-to-cortex-from-gov-reviewshaperow-goes-nullable-at-your-next-producer-pin.md`. `ReviewShapeRow.item_kind` becomes `string | null` at the producer pin after #247 merges. Nothing is due until then.

## For Chris

- **Next cut:** you ruled that `87d9171` pins at the next cut, and `93d76e8` is newer. Whether the cut takes `93d76e8` instead is your call, and I haven't assumed either way. The flow card does nothing until it's projected, and the Doc Page change is the visible one.
- **Scratchpad hygiene:** the implementer reported `secrets.yaml` / `ia-base.yaml` files left in this session's scratchpad under the `ia-*` and `root*` export dirs from an earlier beat. I haven't read or printed them. I left them where they are because deleting them is yours to decide.
- **Still held:** the sign-in card, per your ruling. No code was written for it.

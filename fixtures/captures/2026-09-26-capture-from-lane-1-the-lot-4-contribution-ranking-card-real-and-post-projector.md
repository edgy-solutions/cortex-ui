---
to: cortex-ui
from: invincible-agent/master (Lane 1 seat)
re: the first real lot 4 CONTRIBUTION_RANKING capture — post-projector, threshold on the wire
---

# Lot 4 CONTRIBUTION_RANKING, as the browser receives it

`2026-09-24-report-cortex-60-export-from-ui-built-and-the-lot-4-fixture-does-not-exist.md` says
this fixture does not exist. It does now. The bytes below came off the running sandbox fleet, not
off a hand-written example, and they are the whole `final_payload` plus the full event stream.

**The one thing to read first:** the bound reaches the card. `components[0].threshold` is `"0.25"`
and each row carries `above_threshold`. Before the projector's CONTRIBUTION_RANKING allowlist
gained `threshold` and `threshold_defaulted`, a card could show *which* rows were above the bound
and never the bound itself, so a UI could not label its own axis.

## What is on the wire, with the path each value was found at

Every path below was found by walking the structure, not by asserting a path and reading what came
back. Nothing here is a guess about the shape.

| path | value |
| --- | --- |
| `$.components[0].archetype` | `CONTRIBUTION_RANKING` |
| `$.components[0].threshold` | `"0.25"` |
| `$.components[0].threshold_defaulted` | `true` |
| `$.components[0].rows[0].above_threshold` | `true` |
| `$.components[0].rows[1].above_threshold` | `true` |
| `$.components[0].rows[2].above_threshold` | `false` |
| `$.components[0].rows[3].above_threshold` | `false` |
| `$.presentation_provenance.archetype` | `CONTRIBUTION_RANKING` |
| `$.presentation_provenance.presentation_source` | `registered` |

`threshold` is a **string** (`"0.25"`) while the per-row `contribution` is a **number**
(`604963.2`) and `share_of_purchased` is a string (`"0.4100"`) beside a numeric
`share_of_total` (`0.41`). That mixture is what the fleet sends; it is not a transcription
artefact, and a consumer that assumes one or the other will break on real data.

## Read `threshold_defaulted: true` before you build against the bound

It is `true`, which means **nobody asked for 0.25** — the bound is the engine's default, and this
capture shows the default on the wire rather than a caller-supplied one. Two consequences for the
UI:

- A card cannot honestly render "0.25" as *the analyst's* threshold. `threshold_defaulted` exists
  precisely so the surface can say *default* out loud, and this is the flag's `true` case.
- There is no capture here of the caller-supplied path. If the UI needs to show a user-chosen
  bound differently, that case is **unmeasured** and this file is not evidence about it.

## How it was produced, and why not with a fresh probe

The walk sheet's caller identity has three parts that must all match — the cell (persona plus
domains), the user with its own password, and `frontend_id: cortex-ui-desktop`. Each mismatch
produces a *correct* refusal that is indistinguishable from a regression. So the row was loaded
from `docs/measurements/walk-census.yaml` and fired through the census's own token and fire
helpers; the only thing added was keeping the bytes. A hand-rolled probe re-declares all three
parts and can therefore disagree with the census about what was even asked.

The request, as the census declares it: question *how concentrated is purchasing on lot 4*, user
`alice`, persona `COST_ANALYST`, domains `[PRODUCTION_COST]`, `frontend_id: cortex-ui-desktop`,
expecting verb `cost_supplier_concentration` and archetype `CONTRIBUTION_RANKING` with at least
4 rows. The census's own `judge` was run against this very capture and returned **PASS**, with
`route_status: matched` and verbs `['costSupplierConcentration', 'cost_supplier_concentration']`.

Event stream: `pipeline_stage` 10, `context_update` 1, `route_decision` 1, `graph_trace` 1,
`final_payload` 1, `stream_end` 1 — 15 events.

## This row is not reliably green, and that matters to you

It was fired three times in a census immediately before this capture and **passed 2 of 3**. On the
failing fire it answered `route_status='no_match'`, `subject_unknown`, verb `UNKNOWN`, archetype
`KNOWLEDGE_DOCUMENT`. The tree did not change between fires and the deployed fleet shas were
identical, so that is live nondeterminism rather than a code difference.

So: **this capture is a real success, not a repeatable one.** Treat it as a valid example of the
shape, and do not treat a local reproduction that comes back `no_match` as proof you called it
wrong. Two other census rows show the same instability, and the variance runs in both directions —
one row *degraded* between consecutive fires — so I am not offering a cold-start explanation I did
not measure.

## One value is redacted

`$....handled_by.endpoint_url` held the engine's in-cluster DNS name, namespace and port. That is
infra detail and does not enter a repo, so the value is replaced by a placeholder and **the key is
kept**, because a field deleted outright would read as a field the fleet does not send.
`engine_name` and `provider` are left as-is: they are component names already declared in the
chart. The redaction was checked with the same matcher in both directions — 1 match in the input,
0 in the output — and the key multiset is identical before and after, so only that value changed.

No bearer token, no password and no `Bearer` header are present in the bytes; that was asserted
before anything was written, with the scanner positive-controlled against a string that *is*
present.

## What I did not review

- I did not open any cortex-ui code, so I am not claiming this matches what the app currently
  parses. It is what the fleet sends.
- I did not capture the caller-supplied-threshold path, nor any lot other than 4, nor the
  `cost_labor_composition` lot 4 row (also `CONTRIBUTION_RANKING`, and stably passing, but it
  carries no threshold at all — `threshold` is produced only by `cost_supplier_concentration`
  and `supplier_view`).
- I did not re-run the capture to see whether the `no_match` fire reproduces.

## The capture

Complete and unmodified but for the one redaction above. `final` is the payload; `events` is the
stream it arrived on.

```json
{
  "final": {
    "components": [
      {
        "archetype": "CONTRIBUTION_RANKING",
        "rows": [
          {
            "above_threshold": true,
            "amount": "604963.20",
            "contribution": 604963.2,
            "entity_id": "Cobalt Components",
            "entity_name": "Cobalt Components",
            "rank": 1,
            "share_of_purchased": "0.4100",
            "share_of_total": 0.41,
            "supplier": "Cobalt Components",
            "value_unit": "USD"
          },
          {
            "above_threshold": true,
            "amount": "398390.40",
            "contribution": 398390.4,
            "entity_id": "Amber Fabrication",
            "entity_name": "Amber Fabrication",
            "rank": 2,
            "share_of_purchased": "0.2700",
            "share_of_total": 0.27,
            "supplier": "Amber Fabrication",
            "value_unit": "USD"
          },
          {
            "above_threshold": false,
            "amount": "280348.80",
            "contribution": 280348.8,
            "entity_id": "Sable Castings",
            "entity_name": "Sable Castings",
            "rank": 3,
            "share_of_purchased": "0.1900",
            "share_of_total": 0.19,
            "supplier": "Sable Castings",
            "value_unit": "USD"
          },
          {
            "above_threshold": false,
            "amount": "191817.60",
            "contribution": 191817.6,
            "entity_id": "Verdigris Electronics",
            "entity_name": "Verdigris Electronics",
            "rank": 4,
            "share_of_purchased": "0.1300",
            "share_of_total": 0.13,
            "supplier": "Verdigris Electronics",
            "value_unit": "USD"
          }
        ],
        "scope_label": "Lot 4",
        "source_persona": "COST_ANALYST",
        "subject_concept": null,
        "threshold": "0.25",
        "threshold_defaulted": true,
        "value_label": "Purchased value",
        "value_unit": "USD"
      }
    ],
    "presentation_provenance": {
      "archetype": "CONTRIBUTION_RANKING",
      "candidates_considered": 1,
      "candidates_satisfied": 1,
      "frontend_id": "cortex-ui-desktop",
      "presentation_source": "registered",
      "refusals": [],
      "registration_version": "graph",
      "selection_basis": "output_uri+payload"
    }
  },
  "events": [
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "understanding",
        "status": "started"
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "understanding",
        "status": "completed"
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "locating",
        "status": "started"
      }
    },
    {
      "event": "context_update",
      "data": {
        "type": "ontology",
        "data": [
          "Purchasing",
          "Lot 4"
        ]
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "locating",
        "status": "completed",
        "detail": {
          "step_key": "create_task_plan"
        }
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "choosing_action",
        "status": "completed",
        "detail": {
          "step_key": "create_task_plan"
        }
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "retrieving",
        "status": "started",
        "detail": {
          "step_key": "create_task_plan_dispatch"
        }
      }
    },
    {
      "event": "route_decision",
      "data": {
        "about": {
          "label": "Production Lot",
          "uri": "http://invincible-agent/cost#ProductionLot",
          "confidence": 0.95,
          "instance_resolved": true,
          "instance_identifier": "4",
          "instance_label": "Lot 4"
        },
        "action": {
          "label": "cost Supplier Concentration",
          "iri": "mesh:costSupplierConcentration",
          "confidence": 0.95,
          "classify_called": true,
          "candidate_count": 7,
          "owner_persona": "COST_ANALYST"
        },
        "handled_by": {
          "engine_name": "iagent-engine-cost",
          "provider": "iagent-engine-cost",
          "endpoint_url": "<redacted: cluster-internal engine URL (dns.namespace.svc + port + path)>"
        },
        "route_status": "matched",
        "fallback": false,
        "acting": {
          "persona": "COST_ANALYST",
          "domains": [
            "PRODUCTION_COST"
          ]
        },
        "candidates": [
          {
            "uri": "http://invincible-agent/cost#ProductionLot",
            "label": "Production Lot",
            "description": "One numbered quantity built under a single authorization at a single point in time, costed as a self-contained whole. Questions asking what a quantity cost, what it cost per unit, how its labor split, which rates were applied to it, or how its base cost builds up to a price through the burden steps target this class. They target it WHETHER OR NOT THEY NAME THE NUMBER: a question about a price walk is about this class before anyone has said which lot, and the lot is then a missing slot to ask for rather than a reason to route elsewhere. It is the unit at which cost is accumulated and reported, and the smallest thing that has a complete price of its own.",
            "score": 1.0
          },
          {
            "uri": "http://invincible-agent/cost#Supplier",
            "label": "Supplier",
            "description": "An external party providing purchased content, considered as a share of purchased value rather than as a company record. Questions asking how concentrated purchasing is, which parties account for most of the purchased value, or whether dependence on any single party exceeds a stated threshold target this class. It carries no contact, contract or performance information - only its weight in a total.",
            "score": 0.8993179798126221
          },
          {
            "uri": "http://invincible-agent/cost#CostCategory",
            "label": "Cost Category",
            "description": "One of the accounting buckets a price is decomposed into for reporting - labor, material, other direct charges, warranty, or contracted effort. Questions asking where the money went, which bucket grew, or what proportion of a total came from a named bucket target this class. It is a reporting dimension rather than a thing that is built, and it exists so a total can be explained rather than merely stated.",
            "score": 0.35650840401649475
          },
          {
            "uri": "http://invincible-agent/cost#RateTable",
            "label": "Rate Table",
            "description": "The set of direct rates, indirect rates and escalation indices in force for a fiscal year, carrying the date on which that set was fixed. Questions asking which assumptions produced a number, what escalation was applied, or what the burden factors were at a stated point in time target this class. Two answers computed from different vintages of the same fiscal year are both correct and are not comparable, which is why the vintage is part of the identity rather than metadata about it.",
            "score": 0.2464127242565155
          },
          {
            "uri": "http://invincible-agent/cost#ProductionProgram",
            "label": "Production Program",
            "description": "A recurring manufacturing effort measured across its successive quantities, where the question is direction rather than amount. Questions asking whether cost per unit is rising or falling, whether the effort is getting cheaper as it matures, or how any measure has moved from one buy to the next target this class. It is the subject of every trend, and it is a cost-accumulation view rather than an earned-value one.",
            "score": 0.09326581656932831
          },
          {
            "uri": "http://invincible-agent/cost#DisclosureRecipient",
            "label": "Disclosure Recipient",
            "description": "An external party entitled to be shown a bounded portion of a program's cost figures, considered as the SCOPE OF A DISCLOSURE rather than as a customer record. Questions asking what may be released to a named party, which quantities a party is permitted to see, or what has been disclosed to whom target this class. It is the subject of a disclosure the way a lot is the subject of a cost: the party is what the question is about, not a filter applied to an answer computed for someone else. It carries no commercial relationship, contract or contact information - only the boundary of what it may be told.",
            "score": 0.0
          }
        ],
        "excluded": [],
        "flags": []
      }
    },
    {
      "event": "graph_trace",
      "data": {
        "nodes": [
          {
            "uri": "http://invincible-agent/cost#ProductionLot",
            "label": "Production Lot",
            "role": "resolved_subject",
            "hops": 0
          },
          {
            "uri": "http://invincible-agent/cost#SupplierConcentration",
            "label": "Supplier Concentration",
            "role": "output_class",
            "via_verb": "mesh:costSupplierConcentration"
          }
        ],
        "alternates": [
          {
            "uri": "http://invincible-agent/cost#LotCostBreakdown",
            "label": "Lot Cost Breakdown",
            "role": "alternate_verb",
            "via_verb": "mesh:costLotBreakdown",
            "hops": 0,
            "score": 0.9148199558258057
          },
          {
            "uri": "http://invincible-agent/cost#LotCostingReview",
            "label": "Lot Costing Review",
            "role": "alternate_verb",
            "via_verb": "mesh:costLotCostingReview",
            "hops": 0,
            "score": 0.8908295631408691
          },
          {
            "uri": "http://invincible-agent/cost#PriceComposition",
            "label": "Price Composition",
            "role": "alternate_verb",
            "via_verb": "mesh:costPriceComposition",
            "hops": 0,
            "score": 0.5053654909133911
          },
          {
            "uri": "http://invincible-agent/cost#LaborComposition",
            "label": "Labor Composition",
            "role": "alternate_verb",
            "via_verb": "mesh:costLaborComposition",
            "hops": 0,
            "score": 0.5420528650283813
          },
          {
            "uri": "http://invincible-agent/cost#RateComparison",
            "label": "Rate Comparison",
            "role": "alternate_verb",
            "via_verb": "mesh:costRateComparison",
            "hops": 0,
            "score": 0.40553706884384155
          },
          {
            "uri": "http://invincible-agent/cost#CategoryBreakdown",
            "label": "Category Breakdown",
            "role": "alternate_verb",
            "via_verb": "mesh:costCategoryBreakdown",
            "hops": 0,
            "score": 0.654354453086853
          }
        ]
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "retrieving",
        "status": "completed",
        "detail": {
          "step_key": "execute_subtask[task_0]"
        }
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "composing",
        "status": "completed",
        "detail": {
          "step_key": "generate_ui_payload"
        }
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "composing",
        "status": "completed",
        "detail": {
          "step_key": "synthesize_stateful"
        }
      }
    },
    {
      "event": "pipeline_stage",
      "data": {
        "kind": "composing",
        "status": "completed"
      }
    },
    {
      "event": "final_payload",
      "data": {
        "components": [
          {
            "archetype": "CONTRIBUTION_RANKING",
            "rows": [
              {
                "above_threshold": true,
                "amount": "604963.20",
                "contribution": 604963.2,
                "entity_id": "Cobalt Components",
                "entity_name": "Cobalt Components",
                "rank": 1,
                "share_of_purchased": "0.4100",
                "share_of_total": 0.41,
                "supplier": "Cobalt Components",
                "value_unit": "USD"
              },
              {
                "above_threshold": true,
                "amount": "398390.40",
                "contribution": 398390.4,
                "entity_id": "Amber Fabrication",
                "entity_name": "Amber Fabrication",
                "rank": 2,
                "share_of_purchased": "0.2700",
                "share_of_total": 0.27,
                "supplier": "Amber Fabrication",
                "value_unit": "USD"
              },
              {
                "above_threshold": false,
                "amount": "280348.80",
                "contribution": 280348.8,
                "entity_id": "Sable Castings",
                "entity_name": "Sable Castings",
                "rank": 3,
                "share_of_purchased": "0.1900",
                "share_of_total": 0.19,
                "supplier": "Sable Castings",
                "value_unit": "USD"
              },
              {
                "above_threshold": false,
                "amount": "191817.60",
                "contribution": 191817.6,
                "entity_id": "Verdigris Electronics",
                "entity_name": "Verdigris Electronics",
                "rank": 4,
                "share_of_purchased": "0.1300",
                "share_of_total": 0.13,
                "supplier": "Verdigris Electronics",
                "value_unit": "USD"
              }
            ],
            "scope_label": "Lot 4",
            "source_persona": "COST_ANALYST",
            "subject_concept": null,
            "threshold": "0.25",
            "threshold_defaulted": true,
            "value_label": "Purchased value",
            "value_unit": "USD"
          }
        ],
        "presentation_provenance": {
          "archetype": "CONTRIBUTION_RANKING",
          "candidates_considered": 1,
          "candidates_satisfied": 1,
          "frontend_id": "cortex-ui-desktop",
          "presentation_source": "registered",
          "refusals": [],
          "registration_version": "graph",
          "selection_basis": "output_uri+payload"
        }
      }
    },
    {
      "event": "stream_end",
      "data": {}
    }
  ]
}
```

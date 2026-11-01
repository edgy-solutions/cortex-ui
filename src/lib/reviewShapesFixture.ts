/**
 * The platform's seed rows of the review-shape registry, as `GET /review-shapes` serves them.
 * Copied from invincible-agent 41230a7e (0.4.73), `policy/review_shapes/{course,document,finding,notice}.yaml`,
 * sorted by review_shape. The mock transport answers with this; a test pins it to the producer's files.
 */
import type { ShapeRow } from "./reviewShapes";

export const REVIEW_SHAPES_FIXTURE: ShapeRow[] = [
  { review_shape: "course", item_kind: "concept", rules_version: "course.v1", params: {}, rules: [] },
  { review_shape: "document", item_kind: "section", rules_version: "document.v1", params: {}, rules: [] },
  { review_shape: "finding", item_kind: "finding", rules_version: "finding.v1", params: {}, rules: [] },
  {
    review_shape: "notice",
    item_kind: "part",
    rules_version: "notice.v1",
    params: {},
    rules: [
      { id: "same_shape_run", params: { min_run: 3, per_run: 2, sample_all_up_to: 4 } },
      { id: "same_inherited_crop", params: { min_shared: 3 } },
    ],
  },
];

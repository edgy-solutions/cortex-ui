/**
 * Types for the extractor, so the parity seal reads it with real types rather than `any`.
 *
 * Hand-written rather than generated: the script is plain JS on purpose (it runs as a node CLI with
 * no build step, which is what lets the snapshot be re-taken by one command). An `any` import would
 * have compiled, and would have silently turned every field access in the seal into an unchecked
 * one — including the `name`/`annotation` keys the whole comparison is built on.
 */
export interface PyFieldDecl {
  name: string;
  annotation: string;
  /** The literal default as written, or `null` when the field has none. */
  default: string | null;
}

export interface PyValidatorDecl {
  /** The name of the `def` the decorator decorates — NOT the field it validates. */
  name: string;
  /** `field_validator` or `model_validator`. Both are captured; keying on one would have taken
   *  1 of the 7 validators the mirrored files declare. */
  kind: string;
  /** The decorator line(s) as written, including `mode="after"` where present. */
  decorator: string;
  /** The whole block, decorator through body, so drift in the CONDITION is visible and not just
   *  drift in the name. */
  source: string;
}

export interface MeshSdkParitySnapshot {
  provenance: {
    sdk_repo: string;
    sdk_ref: string;
    sdk_sha: string;
    sdk_release: string;
    extractor: string;
    sources: string[];
  };
  classes: Record<string, { file: string; fields: PyFieldDecl[]; validators: PyValidatorDecl[] }>;
}

export declare const DEFAULT_SDK: string;
export declare const MIRRORED: [string, string][];
export declare function extractClass(src: string, className: string): PyFieldDecl[];
export declare function extractValidators(src: string, className: string): PyValidatorDecl[];
export declare function extract(sdkRoot?: string): MeshSdkParitySnapshot;

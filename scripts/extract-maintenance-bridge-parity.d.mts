/**
 * Types for `extract-maintenance-bridge-parity.mjs`, the same reason
 * `extract-mesh-sdk-parity.d.mts` exists beside its own script: an `any` import would compile and
 * would silently turn every field access the parity seal does into an unchecked one.
 */
import type { PyFieldDecl, PyValidatorDecl } from "./extract-mesh-sdk-parity.d.mts";

export interface MaintenanceBridgeParitySnapshot {
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
export declare const SOURCE_FILE: string;
export declare const PINNED_REF: string;
export declare const PINNED_SHA: string;
export declare const MIRRORED: string[];
export declare function showAt(sdkRoot: string, ref: string, file: string): string;
export declare function extractAtRef(sdkRoot?: string, ref?: string): MaintenanceBridgeParitySnapshot;

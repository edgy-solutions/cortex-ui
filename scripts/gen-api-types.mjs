#!/usr/bin/env node
/**
 * Generate TypeScript types from the committed OpenAPI snapshots (zero dependencies).
 *
 *   node scripts/gen-api-types.mjs        (npm run gen:api)
 *
 * Reads  src/api/openapi/cortex-bff.openapi.json  -> src/api/generated/bff.ts
 *        src/api/openapi/ingest-v1.openapi.json   -> src/api/generated/ingestV1.ts
 *
 * `generate(doc, { sourceName, sha })` is PURE and deterministic (schemas sorted by name, operations
 * sorted by key, properties in document order), so src/api/openapi.seal.test.ts can re-run it over the
 * committed snapshot and compare with the committed output byte for byte.
 *
 * ENUM CONSTANTS. Every schema property that declares an enum (directly, or as a member of a nullable
 * anyOf) is also emitted as `export const <Schema>_<field> = [...] as const;`. Where several schemas of ONE
 * document carry the same field with an enum, one canonical `<FIELD>` constant is emitted too, and ONLY if
 * every copy is identical: a split enum THROWS naming the copies (a producer finding, not ours to paper over).
 *
 * It THROWS on a construct it does not map (allOf / oneOf / a $ref outside #/components/schemas / a
 * parameter $ref): a type silently widened to `unknown` is the failure this generator exists to stop.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const METHODS = ["get", "post", "put", "delete", "patch"];
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k));
const lit = (v) => JSON.stringify(v);

function refName(ref) {
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref: ${ref}`);
  return m[1];
}

const isEmpty = (s) => s === undefined || s === null || (typeof s === "object" && Object.keys(s).length === 0);

/** A TS type expression for one schema. `indent` is the nesting depth of the line it will sit on. */
export function tsType(schema, indent = 0) {
  if (isEmpty(schema)) return "unknown";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.allOf || schema.oneOf) throw new Error(`unsupported construct (allOf/oneOf): ${JSON.stringify(schema).slice(0, 120)}`);
  if (schema.anyOf) return union(schema.anyOf.map((s) => tsType(s, indent)));
  if ("const" in schema) return lit(schema.const);
  if (schema.enum) return union(schema.enum.map(lit));
  const t = schema.type;
  if (Array.isArray(t)) return union(t.map((one) => tsType({ ...schema, type: one }, indent)));
  switch (t) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const inner = schema.items ? tsType(schema.items, indent) : "unknown";
      return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
    }
    case "object":
    case undefined:
      return objectType(schema, indent);
    default:
      throw new Error(`unsupported type: ${JSON.stringify(t)}`);
  }
}

function union(parts) {
  const seen = [];
  for (const p of parts) if (!seen.includes(p)) seen.push(p);
  return seen.join(" | ");
}

function objectType(schema, indent) {
  const props = schema.properties ?? {};
  const names = Object.keys(props);
  const ap = schema.additionalProperties;
  if (names.length === 0) {
    if (ap === undefined || ap === true || isEmpty(ap)) return "Record<string, unknown>";
    if (ap === false) return "Record<string, never>";
    return `{ [k: string]: ${tsType(ap, indent)} }`;
  }
  const required = new Set(schema.required ?? []);
  const pad = "  ".repeat(indent + 1);
  const lines = names.map((n) => `${pad}${key(n)}${required.has(n) ? "" : "?"}: ${tsType(props[n], indent + 1)};`);
  if (ap === true || (ap !== undefined && ap !== false && isEmpty(ap))) lines.push(`${pad}[k: string]: unknown;`);
  const body = `{\n${lines.join("\n")}\n${"  ".repeat(indent)}}`;
  if (ap !== undefined && ap !== true && ap !== false && !isEmpty(ap)) {
    // A schema-typed index signature is only legal beside properties that fit it; the intersection is always legal.
    return `${body} & { [k: string]: ${tsType(ap, indent)} }`;
  }
  return body;
}

function paramsType(params, where) {
  const ps = params.filter((p) => p.in === where);
  if (ps.length === 0) return "never";
  const lines = ps.map((p) => `      ${key(p.name)}${p.required || where === "path" ? "" : "?"}: ${tsType(p.schema, 3)};`);
  return ["{", ...lines, "    }"].join("\n");
}

function bodyType(op) {
  const rb = op.requestBody;
  if (!rb) return "never";
  const content = rb.content ?? {};
  let t;
  if (content["application/json"]) t = tsType(content["application/json"].schema, 2);
  else if (content["multipart/form-data"]) t = "FormData";
  else throw new Error(`unsupported request content types: ${Object.keys(content).join(", ")}`);
  return rb.required ? t : `${t} | undefined`;
}

function responseType(op) {
  const r = op.responses?.["200"];
  const content = r?.content;
  if (!content) return "unknown";
  const json = content["application/json"];
  if (json && !isEmpty(json.schema)) return tsType(json.schema, 2);
  const others = Object.keys(content).filter((c) => c !== "application/json");
  if (others.length > 0) return "Blob";
  return "unknown";
}

/** The enum a property declares: directly, or as one anyOf member (the nullable spelling). */
function propEnum(prop) {
  if (!prop || typeof prop !== "object") return undefined;
  if (Array.isArray(prop.enum)) return prop.enum;
  if (Array.isArray(prop.anyOf)) {
    const hit = prop.anyOf.find((m) => m && Array.isArray(m.enum));
    if (hit) return hit.enum;
  }
  return undefined;
}

/** [{ schema, field, values }] in schema-name then property order. */
export function enumConstants(schemas) {
  const found = [];
  for (const name of Object.keys(schemas).sort()) {
    for (const [field, prop] of Object.entries(schemas[name]?.properties ?? {})) {
      const values = propEnum(prop);
      if (values) found.push({ schema: name, field, values });
    }
  }
  return found;
}

export function generate(doc, { sourceName, sha }) {
  const out = [];
  out.push(`// GENERATED by scripts/gen-api-types.mjs from src/api/openapi/${sourceName} (invincible-agent@${String(sha).slice(0, 7)}). DO NOT EDIT — run npm run gen:api.`);
  out.push("");

  const schemas = doc.components?.schemas ?? {};
  for (const name of Object.keys(schemas).sort()) {
    if (!IDENT.test(name)) throw new Error(`schema name is not a TS identifier: ${name}`);
    out.push(`export type ${name} = ${tsType(schemas[name], 0)};`);
    out.push("");
  }

  const enums = enumConstants(schemas);
  if (enums.length > 0) {
    out.push("// Enum constants: one per schema property that declares an enum; <FIELD> where >1 schema repeats it identically.");
    for (const e of enums) {
      out.push(`export const ${e.schema}_${e.field} = ${lit(e.values)} as const;`);
    }
    out.push("");
    const byField = new Map();
    for (const e of enums) byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
    for (const [field, copies] of byField) {
      if (copies.length < 2) continue;
      const first = JSON.stringify(copies[0].values);
      const odd = copies.filter((c) => JSON.stringify(c.values) !== first);
      if (odd.length > 0) {
        throw new Error(
          `split enum for field "${field}": ${copies.map((c) => `${c.schema}=${JSON.stringify(c.values)}`).join("; ")}`,
        );
      }
      out.push(`export const ${field.toUpperCase()} = ${first} as const;`);
    }
    out.push("");
  }

  const ops = [];
  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])];
      if (params.some((x) => x.$ref)) throw new Error(`parameter $ref not supported: ${m} ${p}`);
      ops.push({ k: `${m.toUpperCase()} ${p}`, op, params });
    }
  }
  ops.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

  out.push("// Header parameters (e.g. X-Frontend-Id) are not modelled; they are set by the transport, not the caller.");
  out.push("export interface Operations {");
  for (const { k, op, params } of ops) {
    out.push(`  ${lit(k)}: {`);
    out.push(`    path: ${paramsType(params, "path")};`);
    out.push(`    query: ${paramsType(params, "query")};`);
    out.push(`    body: ${bodyType(op)};`);
    out.push(`    response: ${responseType(op)};`);
    out.push("  };");
  }
  out.push("}");
  out.push("");
  out.push("export const OPERATION_KEYS = [");
  for (const { k } of ops) out.push(`  ${lit(k)},`);
  out.push("] as const;");
  out.push("");
  return out.join("\n");
}

const TARGETS = [
  { snapshot: "cortex-bff.openapi.json", out: "bff.ts" },
  { snapshot: "ingest-v1.openapi.json", out: "ingestV1.ts" },
];

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sources = JSON.parse(readFileSync(path.join(root, "src/api/openapi/SOURCES.json"), "utf8"));
  mkdirSync(path.join(root, "src/api/generated"), { recursive: true });
  for (const t of TARGETS) {
    const doc = JSON.parse(readFileSync(path.join(root, "src/api/openapi", t.snapshot), "utf8"));
    const src = generate(doc, { sourceName: t.snapshot, sha: sources[t.snapshot].sha });
    writeFileSync(path.join(root, "src/api/generated", t.out), src);
    console.log(`wrote src/api/generated/${t.out} (${src.length} chars)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export function tsType(schema: unknown, indent?: number): string;
export function generate(doc: unknown, opts: { sourceName: string; sha: string }): string;
export function enumConstants(schemas: Record<string, any>): { schema: string; field: string; values: readonly unknown[] }[];

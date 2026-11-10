/**
 * One value of an option's `data`, drawn by its own shape. The producer hands the task's option
 * objects through whole (`project_options`: every key but verb/label), so a value is whatever the
 * workflow wrote, lists of objects and nested objects included, and `String(value)` drew each of
 * those as "[object Object]" (0.4.85 walk; the shapes are in `Card.optionData.test.tsx`).
 *
 * No field is named here (config names the case): a list draws each element, an object draws each
 * of ITS keys, recursively, and a scalar is the only thing ever turned into text. `null`, an empty
 * list and an object with no keys each say so, and say different things.
 */
const MAX_DEPTH = 6;

export function OptionValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return (
      <span className="text-slate-600" data-option-value="none">
        none
      </span>
    );
  }
  if (typeof value !== "object") {
    return <span data-option-value="scalar">{String(value)}</span>;
  }
  if (depth >= MAX_DEPTH) {
    // Past the bound the fields still show, as JSON: never a coerced object.
    return <code data-option-value="deep">{JSON.stringify(value)}</code>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className="text-slate-600" data-option-value="empty-list">
          none listed
        </span>
      );
    }
    return (
      <ol className="flex flex-col gap-1" data-option-value="list">
        {value.map((el, i) => (
          <li key={i} className="border-l border-slate-700/50 pl-2" data-option-item={i}>
            <OptionValue value={el} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return (
      <span className="text-slate-600" data-option-value="empty-record">
        no fields
      </span>
    );
  }
  return (
    <dl className="flex flex-col gap-0.5" data-option-value="record">
      {keys.map((key) => (
        <div key={key} className="flex gap-2" data-option-field={key}>
          <dt className="text-slate-500">{key}</dt>
          <dd className="min-w-0 break-all text-slate-300">
            <OptionValue value={(value as Record<string, unknown>)[key]} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

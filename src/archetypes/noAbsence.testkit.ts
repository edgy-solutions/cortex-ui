/**
 * The `noAbsence` seal's instrument — pure DOM, no Node builtins (every `*.testkit.ts` ships).
 *
 * A package that declares `noAbsence` claims no `data-*` attribute flips with the payload. This
 * is the check that claim is held to: collect the attribute NAMES in each card's subtree and
 * return the ones present under some roots and absent under others.
 */

/** Every `data-*` attribute name on the root and anywhere beneath it. */
function dataNamesIn(root: Element): Set<string> {
  const names = new Set<string>();
  const visit = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("data-")) names.add(attr.name);
    }
  };
  visit(root);
  root.querySelectorAll("*").forEach(visit);
  return names;
}

/**
 * The `data-*` names present under at least one root and absent under at least one other, minus
 * `exclude` (attributes that appear only on interaction), sorted. `[]` means nothing flips.
 */
export function flippingDataAttributes(
  roots: readonly Element[],
  exclude: readonly string[] = [],
): string[] {
  const perRoot = roots.map(dataNamesIn);
  const all = new Set<string>();
  for (const names of perRoot) for (const n of names) all.add(n);
  const skip = new Set(exclude);
  return [...all]
    .filter((n) => !skip.has(n))
    .filter((n) => {
      const present = perRoot.filter((names) => names.has(n)).length;
      return present > 0 && present < perRoot.length;
    })
    .sort();
}

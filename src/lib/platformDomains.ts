/**
 * PLATFORM DOMAINS — in scope, never on the menu.
 *
 * MESH and DOCS are entitlement cells like any other (`GET /me/entitlements`), but they are not
 * a speciality anyone chooses: MESH is the system answering about itself, DOCS is the corpus
 * that explains it (ADR-0037; `docs_agent` registers agnostic). Offering them in the picker's
 * "SPECIALIZED IN" column made a reader choose between their job and the manual — and choosing
 * their job dropped the manual out of `active_domains`, because the picker is single-domain.
 *
 * So the two halves are split: the PICK is from the pickable domains, and the SCOPE sent is the
 * pick plus whichever platform domains the persona is actually entitled to. Never added
 * unentitled — scope is what the server granted, and cortex only stops asking a person to choose it.
 *
 * ⚠ THE LIST IS CORTEX'S, BY DISPATCH. The entitlement cell (`EntitlementCell {persona, domain}`,
 * src/api/types.ts) carries no platform marker, so these names cannot be derived. If the server
 * ever marks a cell as platform scope, THAT is the source and this list should be deleted.
 */
export const PLATFORM_DOMAINS: readonly string[] = ["MESH", "DOCS"];

export const isPlatformDomain = (d: string): boolean => PLATFORM_DOMAINS.includes(d);

/** What the picker offers: the entitled domains a person would choose between. */
export const pickableDomains = (entitled: readonly string[]): string[] =>
  entitled.filter((d) => !isPlatformDomain(d));

/**
 * What is SENT as `active_domains`: the pick first, then each ENTITLED platform domain not
 * already in it. A platform domain the persona does not hold is never added.
 */
export function inScope(picked: readonly string[], entitled: readonly string[]): string[] {
  const out = [...picked];
  for (const d of entitled) if (isPlatformDomain(d) && !out.includes(d)) out.push(d);
  return out;
}

/**
 * ADR-0026 persona/domain picker — "hover-morph bolt trigger" (design
 * option 2e, per design_handoff_persona_domain_trigger/).
 *
 * The composer's bolt glyph IS the picker. Idle: bare bolt, composer
 * looks untouched. Hover: a label pill slides out ("Data Engineer ·
 * Aviation"). Click: a two-column palette (ANSWERING AS | SPECIALIZED
 * IN) opens below. Selecting an item updates + closes. Esc / outside
 * click closes.
 *
 * This REPLACES the composer's static bolt glyph (it renders the bolt
 * itself) — mounted in InputBar in the bolt's old slot, not as a
 * separate row below the input.
 *
 * State comes from usePersonaStore (topaz-resolved entitlement matrix
 * + current selection). Options are NOT hardcoded — persona list is
 * the user's entitled personas, domain list is the domains entitled
 * to the selected persona.
 *
 * Three renders by entitlement state:
 *   * hasEntitlements → full bolt picker (the design).
 *   * source topaz/cache + cells==0 → bolt whose palette shows a
 *     single "no entitlements — request access" affordance (keeps
 *     the ADR-0026 distinguishable-not-hidden posture without a
 *     layout-breaking banner).
 *   * legacy (jwt-legacy/fallback) OR loading OR error → bare static
 *     bolt, no interactivity (nothing to configure; composer looks
 *     untouched per the design's idle state).
 */
import { useEffect, useRef, useState } from "react";
import { usePersonaStore } from "@/store/usePersonaStore";

// Design tokens — exact values from the handoff spec. The app's neon
// palette doesn't have direct equivalents for these specific shades,
// so per the handoff ("match exactly; substitute only where a direct
// equivalent exists") we use the literal hex.
const CYAN = "#3fe6d6"; // persona / system accent
const BLUE = "#5b8cff"; // domain / bolt accent

// SNAKE_CASE → Title Case for display; raw enum is what gets submitted.
const nice = (v: string): string =>
  v
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");

const BoltSvg = () => (
  <svg
    className="pp-bolt"
    width="13"
    height="16"
    viewBox="0 0 13 16"
    aria-hidden="true"
  >
    <path d="M7 0 0 9h5l-1 7 8-10H7z" fill={BLUE} />
  </svg>
);

export function PersonaPicker() {
  const {
    entitlements,
    entitlementsLoading,
    entitlementsError,
    selectedPersona,
    selectedDomains,
    setSelectedPersona,
    setSelectedDomains,
    hasEntitlements,
    domainsFor,
    personas,
  } = usePersonaStore();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // The fetch DELIBERATELY does not live here any more. Entitlements are session bootstrap
  // data, not card data, and this component mounts deep inside the answer surface — so owning
  // the fetch meant a request that decides whether the user can pick a persona was issued
  // AFTER the card tree rendered, behind however many artifacts the session holds. Under
  // HTTP/1.1 (~6 connections per origin, two held open by Electric shapes) it could sit unsent
  // until it timed out. App fetches it on auth-ready instead; this component only READS.
  //
  // Wrong ordering in any protocol, incidentally — h2 makes it survivable, not correct.

  // Esc + outside-click close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const source = entitlements?.source ?? "unknown";
  const topazAuthoritative = source === "topaz" || source === "cache";
  const entitled = hasEntitlements();

  // Legacy path / loading / error → a bolt with nothing behind it.
  //
  // These are THREE different situations and this branch used to render them as one silent,
  // unlabelled, `aria-hidden` glyph: no tooltip, no cursor change, no copy. A user — the
  // person who built it, in fact — read the unresponsive bolt as a frozen UI and reported the
  // app as hung. It was not hung; there was simply nothing to click, and the component said
  // so in no way at all.
  //
  // Worse, `entitlementsError` was being captured in the store and never read here, so a
  // FAILED fetch was presented exactly like a legitimate "you have nothing to configure".
  // That is a failure wearing an empty state's clothes, which is the one thing this codebase
  // consistently refuses to ship. Silence is not honesty when the reader cannot tell absence
  // from breakage.
  //
  // The bolt still does nothing — that part was correct — but it now says WHY, and an error
  // is visually distinct from an empty entitlement set rather than identical to it.
  if (!entitled && !(topazAuthoritative && !entitlementsLoading)) {
    const reason = entitlementsError
      ? `Persona selection unavailable — could not load entitlements: ${entitlementsError}`
      : entitlementsLoading
        ? "Loading entitlements…"
        : "Persona selection unavailable — no entitlements loaded for this session";
    return (
      <span className="pp-wrap">
        <PickerStyles />
        <span
          className="pp-trigger pp-static"
          // Not aria-hidden any more: it carries a reason now, and a screen reader user has
          // the same question a sighted one does.
          role="img"
          aria-label={reason}
          title={reason}
          style={entitlementsError ? { filter: "hue-rotate(310deg)" } : undefined}
        >
          <BoltSvg />
        </span>
      </span>
    );
  }

  // Topaz-authoritative but zero cells → discreet request-access
  // affordance inside the same trigger.
  if (!entitled) {
    return (
      <span className="pp-wrap" ref={wrapRef}>
        <PickerStyles />
        <span
          className={"pp-trigger" + (open ? " pp-open-label" : "")}
          role="button"
          aria-haspopup="true"
          aria-expanded={open}
          tabIndex={0}
          title="No entitlements"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          <BoltSvg />
          <span className="pp-label pp-label-warn">No entitlements</span>
        </span>
        {open && (
          <div className="pp-palette" role="menu">
            <div className="pp-col" style={{ minWidth: 220 }}>
              <div className="pp-col-head pp-head-persona">NO ENTITLEMENTS</div>
              <div className="pp-empty-msg">
                Your account is authenticated but has no persona/domain grants
                in the policy store. Chat falls back to the legacy claim path.
              </div>
              <button
                type="button"
                className="pp-request"
                onClick={() => {
                  console.warn("[access-request] request-access placeholder", {
                    source,
                    at: new Date().toISOString(),
                  });
                  alert(
                    "Access-request flow not yet wired. This click was logged; " +
                      "ping an operator to add you to policy/users.yaml.",
                  );
                }}
              >
                Request access
              </button>
            </div>
          </div>
        )}
      </span>
    );
  }

  // ── Full picker ──────────────────────────────────────────────
  const personaOpts = personas();
  const domainOpts = selectedPersona ? domainsFor(selectedPersona) : [];
  const activeDomain = selectedDomains[0] ?? domainOpts[0] ?? "";

  const pickPersona = (p: string) => {
    setSelectedPersona(p);
    // Single-domain design: reset to the first entitled domain of the
    // newly-chosen persona (store's setSelectedPersona populates ALL;
    // narrow to one to match the "Persona · Domain" single readout).
    const firstDomain = domainsFor(p)[0];
    if (firstDomain) setSelectedDomains([firstDomain]);
    // Deliberately DO NOT close: switching persona surfaces a
    // different set of entitled domains in the right column, and the
    // user probably wants to pick one. Palette stays open until they
    // pick a domain or dismiss (Esc / click-away). If the new persona
    // has exactly one domain there's nothing more to choose, so close
    // as a convenience.
    if (domainsFor(p).length <= 1) setOpen(false);
  };
  const pickDomain = (d: string) => {
    setSelectedDomains([d]);
    // Domain is the terminal choice — close.
    setOpen(false);
  };

  return (
    <span className="pp-wrap" ref={wrapRef}>
      <PickerStyles />
      <span
        className={"pp-trigger" + (open ? " pp-open-label" : "")}
        role="button"
        aria-haspopup="true"
        aria-expanded={open}
        tabIndex={0}
        title="Configure who answers"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <BoltSvg />
        <span className="pp-label">
          <span>{selectedPersona ? nice(selectedPersona) : "—"}</span>
          <span className="pp-sep"> · </span>
          <span>{activeDomain ? nice(activeDomain) : "—"}</span>
        </span>
      </span>

      {open && (
        <div className="pp-palette" role="menu">
          <div className="pp-col pp-col-persona">
            <div className="pp-col-head pp-head-persona">ANSWERING AS</div>
            {personaOpts.map((p) => {
              const sel = p === selectedPersona;
              return (
                <div
                  key={p}
                  className={"pp-item" + (sel ? " pp-selected" : "")}
                  role="menuitemradio"
                  aria-checked={sel}
                  onClick={() => pickPersona(p)}
                >
                  <span>{nice(p)}</span>
                  <span className="pp-dot">●</span>
                </div>
              );
            })}
          </div>
          <div className="pp-divider" />
          <div className="pp-col pp-col-domain">
            <div className="pp-col-head pp-head-domain">SPECIALIZED IN</div>
            {domainOpts.map((d) => {
              const sel = d === activeDomain;
              return (
                <div
                  key={d}
                  className={"pp-item" + (sel ? " pp-selected" : "")}
                  role="menuitemradio"
                  aria-checked={sel}
                  onClick={() => pickDomain(d)}
                >
                  <span>{nice(d)}</span>
                  <span className="pp-dot">●</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

// Scoped styles — exact tokens from the handoff. Inlined as a <style>
// so the values stay pixel-accurate without polluting the global
// stylesheet or requiring tailwind config additions.
const PickerStyles = () => (
  <style>{`
    .pp-wrap { position: relative; display: inline-flex; }
    .pp-trigger {
      display: flex; align-items: center;
      padding: 5px 6px; border-radius: 8px; cursor: pointer;
      transition: background .15s; user-select: none;
    }
    .pp-trigger:not(.pp-static):hover { background: rgba(91,140,255,.09); }
    .pp-static { cursor: default; }
    .pp-bolt { flex: none; filter: drop-shadow(0 0 6px rgba(91,140,255,.55)); }
    .pp-label {
      display: inline-block; overflow: hidden; white-space: nowrap;
      vertical-align: middle; max-width: 0; opacity: 0; margin-left: 0;
      font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
      font-size: 12px; color: rgba(180,205,220,.85);
      transition:
        max-width .3s cubic-bezier(.4,0,.2,1),
        opacity .22s ease,
        margin-left .3s cubic-bezier(.4,0,.2,1);
    }
    .pp-label-warn { color: rgba(255,120,150,.9); }
    .pp-trigger:hover .pp-label,
    .pp-trigger.pp-open-label .pp-label {
      max-width: 240px; opacity: 1; margin-left: 8px;
    }
    .pp-sep { color: rgba(150,175,195,.4); }

    .pp-palette {
      position: absolute; bottom: calc(100% + 12px); left: 0; z-index: 50;
      display: flex; gap: 10px; padding: 14px;
      background: rgba(9,14,24,.98);
      border: 1px solid rgba(90,190,220,.22); border-radius: 14px;
      box-shadow: 0 18px 48px rgba(0,0,0,.65), 0 0 40px rgba(40,180,200,.12);
    }
    .pp-col { min-width: 160px; }
    .pp-divider { width: 1px; background: rgba(120,160,190,.15); }
    .pp-col-head {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 9px; letter-spacing: .18em; margin: 2px 0 8px 6px;
    }
    .pp-head-persona { color: rgba(63,230,214,.7); }
    .pp-head-domain  { color: rgba(91,140,255,.75); }
    .pp-item {
      padding: 9px 11px; border-radius: 8px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11.5px; letter-spacing: .06em; color: rgba(185,205,220,.8);
      cursor: pointer; display: flex; justify-content: space-between;
      align-items: center; gap: 14px; transition: all .14s;
    }
    .pp-col-persona .pp-item:hover { background: rgba(63,230,214,.08); }
    .pp-col-domain  .pp-item:hover { background: rgba(91,140,255,.08); }
    .pp-item.pp-selected {
      background: rgba(63,230,214,.13); color: #eafeff;
      box-shadow: inset 0 0 0 1px rgba(63,230,214,.3);
      text-shadow: 0 0 12px rgba(63,230,214,.4);
    }
    .pp-dot { font-size: 9px; visibility: hidden; }
    .pp-item.pp-selected .pp-dot { visibility: visible; }
    .pp-col-persona .pp-dot { color: ${CYAN}; }
    .pp-col-domain  .pp-dot { color: ${BLUE}; }
    .pp-empty-msg {
      font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
      font-size: 11px; line-height: 1.5; color: rgba(180,205,220,.7);
      margin: 0 6px 10px; max-width: 220px;
    }
    .pp-request {
      display: block; width: calc(100% - 12px); margin: 0 6px;
      padding: 8px 10px; border-radius: 8px;
      background: rgba(255,120,150,.08);
      border: 1px solid rgba(255,120,150,.4); color: rgba(255,150,175,.95);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
      cursor: pointer; transition: background .14s;
    }
    .pp-request:hover { background: rgba(255,120,150,.16); }
  `}</style>
);

import { useRegistrationStore } from "@/store/useRegistrationStore";

/**
 * Shown when this tab's bundle is older than the one served (see `bundleFreshness.ts`): says the
 * menu is not registered if registration was refused, else offers a reload. Renders nothing otherwise.
 */
export function StaleBundleBanner() {
  const stale = useRegistrationStore((s) => s.stale);
  if (!stale) return null;
  return (
    <div
      role="status"
      data-stale-bundle
      data-stale-mine={stale.mine}
      data-stale-served={stale.served}
      data-stale-refused={stale.refused ? "true" : "false"}
      className="flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/15 px-3 py-1 text-xs text-amber-300"
    >
      <span>
        Newer Cortex deployed (served {stale.served.slice(0, 7)}, this tab {stale.mine.slice(0, 7)})
        {stale.refused ? " — this tab's menu is not registered" : " — reload to update"}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-500/25"
      >
        Reload
      </button>
    </div>
  );
}

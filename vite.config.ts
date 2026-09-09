import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { execSync } from "node:child_process";

/**
 * THE BUNDLE CARRIES THE COMMIT IT WAS BUILT FROM.
 *
 * A static bundle behind nginx has no handler to answer `GET /version` with, so the sha is
 * baked in at build time — the same rule the mesh services follow (`ARG GIT_SHA` in their
 * Dockerfiles), and for the same reason: a value injected by the chart at runtime describes
 * what the deployment BELIEVES it is running, which is exactly the claim in doubt whenever
 * somebody asks whether what they are looking at is what was pushed.
 *
 * Two sources, in order. `GIT_SHA` is what CI and the Dockerfile pass. Falling back to asking
 * git directly is what makes a local `npm run build` — and `npm run dev` — carry a real sha
 * instead of a hole, so the mechanism is exercised in development rather than only in the
 * image, where nobody would notice it broken until they needed it.
 *
 * NULL WHEN GENUINELY UNKNOWN. Not "unknown", not "dev": a placeholder that survives a
 * truthiness check is a value somebody will eventually compare, log, or paste into a ticket as
 * though it identified a commit.
 */
function gitSha(): string | null {
  const fromEnv = (process.env.GIT_SHA ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    // Not a checkout (a docker build without .git, a tarball) → no sha, and that is a fact
    // rather than an error worth failing the build over.
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

/**
 * The curl-able equivalent of the services' `GET /version`, emitted as a build asset.
 *
 * ONE SOURCE, TWO READERS. The bundle stamp and this file both come from the `sha` computed
 * once below. The first draft wrote it in the Dockerfile by regexing the minified output for
 * the stamp, which is a second computation wearing a read's clothes — and the first time the
 * two disagreed, the file is the one a person would curl and believe.
 */
function emitVersionJson(sha: string | null, builtAt: string): Plugin {
  return {
    name: "cortex-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          { component: "cortex-ui", repo: "cortex-ui", git_sha: sha, built_at: builtAt },
          null,
          2,
        ),
      });
    },
  };
}

const SHA = gitSha();
const BUILT_AT = new Date().toISOString();

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths(), emitVersionJson(SHA, BUILT_AT)],
  define: {
    // JSON.stringify(null) is the literal `null`, which is what the reader expects to see when
    // there is no sha — passing the bare string would inject an identifier.
    __CORTEX_GIT_SHA__: JSON.stringify(SHA),
    __CORTEX_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
});

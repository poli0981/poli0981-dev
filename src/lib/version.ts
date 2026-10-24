// Which Worker version is serving this request (wrangler.jsonc `version_metadata`) and which
// git commit it was built from. /api/health and the admin report both, so "did the deploy
// land?" is answered by the live site itself rather than inferred from a dashboard. The
// version id names a Cloudflare upload, not a commit — hence the build-time commit too.

export interface VersionInfo {
  id: string | null;
  tag: string | null;
  timestamp: string | null;
  /** The commit Workers Builds built (astro.config.mjs defines __BUILD_COMMIT__). */
  commit: string | null;
}

type VersionEnv = { CF_VERSION_METADATA?: Partial<WorkerVersionMetadata> };

export function versionInfo(env: VersionEnv | undefined): VersionInfo {
  const meta = env?.CF_VERSION_METADATA;
  return {
    id: meta?.id || null,
    tag: meta?.tag || null,
    timestamp: meta?.timestamp || null,
    // `typeof` so this also runs where the build-time constant was never defined (tests).
    commit: typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : null,
  };
}

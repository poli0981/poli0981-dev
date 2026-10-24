// Loaded before every test file: `node --import ./tests/support/register.mjs --test …`.
//
// Node runs the TypeScript sources directly (type stripping) but knows nothing about what
// Vite, Astro and workerd provide at build/run time. These module hooks fill exactly that gap:
//  - `@/x` → src/x (the tsconfig `paths` alias);
//  - extensionless relative imports (`./github`) and directory imports (`@/i18n`) → .ts;
//  - Astro's and Cloudflare's virtual modules → small stubs in tests/support/stubs/, whose
//    exported values tests can change at run time (live bindings);
//  - `import.meta.env` / `import.meta.glob` → `globalThis.$env` / `globalThis.$glob`.
//    Same length on purpose: coverage maps V8 offsets back onto the file as it is on disk,
//    so the rewritten source must keep every character where it was.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const src = new URL("src/", root);
const stub = (name) => new URL(`stubs/${name}.ts`, import.meta.url).href;

const VIRTUAL = {
  "astro:env/server": stub("astro-env-server"),
  "astro:env/client": stub("astro-env-client"),
  "astro:content": stub("astro-content"),
  "astro:middleware": stub("astro-middleware"),
  "cloudflare:workers": stub("cloudflare-workers"),
  "@astrojs/cloudflare/handler": stub("cloudflare-handler"),
};

const isFile = (url) => {
  const path = fileURLToPath(url);
  return existsSync(path) && statSync(path).isFile();
};

/** `x` → `x.ts` or `x/index.ts`, whichever exists; null when neither does. */
function withTypeScript(url) {
  if (isFile(url)) return url;
  for (const candidate of [`${url}.ts`, `${url}/index.ts`]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

globalThis.$env = {
  DEV: false,
  PROD: true,
  SSR: true,
  MODE: "production",
  BASE_URL: "/",
  SITE: "https://poli0981.dev",
};
// import.meta.glob: tests register fixtures per pattern in globalThis.$globFixtures.
globalThis.$glob = (pattern) => globalThis.$globFixtures?.[pattern] ?? {};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(VIRTUAL, specifier)) {
      return { url: VIRTUAL[specifier], shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const url = withTypeScript(new URL(specifier.slice(2), src).href);
      if (url) return { url, shortCircuit: true };
    }
    const fromProject = context.parentURL?.startsWith(root.href);
    if (fromProject && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      const url = withTypeScript(new URL(specifier, context.parentURL).href);
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (result.format !== "module-typescript" || !url.startsWith(root.href)) return result;
    const source = String(result.source)
      .replaceAll("import.meta.env", "globalThis.$env")
      .replaceAll("import.meta.glob", "globalThis.$glob");
    return { ...result, source };
  },
});

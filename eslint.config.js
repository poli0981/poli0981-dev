import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import svelte from "eslint-plugin-svelte";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      ".astro/",
      ".wrangler/",
      "node_modules/",
      "public/pagefind/",
      "poli0981.dev-docs/",
      "**/worker-configuration.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  ...svelte.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Ambient declaration files idiomatically use triple-slash refs, import() types,
    // and marker interfaces (e.g. App.Locals extends Runtime).
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);

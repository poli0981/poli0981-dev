// Theme preference: resolveTheme() and the pre-paint bootstrap string that ships inline.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { THEME_BOOTSTRAP, THEME_PREFS, resolveTheme } from "../src/lib/theme.ts";

interface Page {
  dataset: Record<string, string>;
  /** Flip the OS setting and fire the bootstrap's change listener. */
  setOs(light: boolean): void;
}

/** Run the bootstrap against a stand-in document, storage and matchMedia. */
function boot(saved: Record<string, string> | "throws", osLight: boolean): Page {
  const dataset: Record<string, string> = {};
  const media = { matches: osLight, listeners: [] as (() => void)[] };
  const storage = {
    getItem(key: string) {
      if (saved === "throws") throw new Error("SecurityError");
      return saved[key] ?? null;
    },
  };
  const matchMedia = (query: string) => {
    assert.equal(query, "(prefers-color-scheme: light)");
    return {
      get matches() {
        return media.matches;
      },
      addEventListener: (type: string, listener: () => void) => {
        assert.equal(type, "change");
        media.listeners.push(listener);
      },
    };
  };
  // The exact string that ships inline, with the three globals it touches passed in.
  new Function("document", "localStorage", "matchMedia", THEME_BOOTSTRAP)(
    { documentElement: { dataset } },
    storage,
    matchMedia,
  );
  return {
    dataset,
    setOs(light) {
      media.matches = light;
      for (const listener of media.listeners) listener();
    },
  };
}

describe("theme", () => {
  it("resolves a preference against the OS setting", () => {
    assert.equal(resolveTheme("light", false), "light");
    assert.equal(resolveTheme("dark", true), "dark");
    assert.equal(resolveTheme("system", true), "light");
    assert.equal(resolveTheme(undefined, false), "dark");
    assert.equal(resolveTheme("sepia", true), "light");
    assert.deepEqual(THEME_PREFS, ["system", "light", "dark"]);
  });

  it("follows the OS when nothing is saved, including later changes", () => {
    const page = boot({}, true);
    assert.deepEqual(page.dataset, { themePref: "system", theme: "light" });
    page.setOs(false);
    assert.equal(page.dataset.theme, "dark");
  });

  it("keeps a saved choice whatever the OS does", () => {
    const page = boot({ theme: "light" }, false);
    assert.deepEqual(page.dataset, { themePref: "light", theme: "light" });
    page.setOs(true);
    page.setOs(false);
    assert.equal(page.dataset.theme, "light");
  });

  it("goes back to following the OS once the toggle picks system", () => {
    const page = boot({ theme: "dark" }, true);
    assert.equal(page.dataset.theme, "dark");
    page.dataset.themePref = "system"; // what ThemeToggle writes
    page.setOs(true);
    assert.equal(page.dataset.theme, "light");
  });

  it("treats an unknown value or unreadable storage as system", () => {
    assert.deepEqual(boot({ theme: "sepia" }, false).dataset, {
      themePref: "system",
      theme: "dark",
    });
    assert.deepEqual(boot("throws", true).dataset, { themePref: "system", theme: "light" });
  });

  it("restores the hidden-scrollbar preference", () => {
    assert.equal(boot({ scrollbar: "hidden" }, false).dataset.scrollbar, "hidden");
    assert.equal(boot({ scrollbar: "shown" }, false).dataset.scrollbar, undefined);
  });
});

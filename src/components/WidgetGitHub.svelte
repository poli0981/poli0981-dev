<script>
  import { onMount } from "svelte";

  /**
   * @type {{
   *   labels: { title: string, push: string, release: string },
   *   locale: string,
   *   initial: import('../lib/widgets').WidgetsPayload
   * }}
   */
  let { labels, locale, initial } = $props();

  let data = $state(initial);

  // Latest 3 events; a source counts as present only when its status is not "na".
  const items = $derived(data.status?.gh !== "na" ? (data.gh?.items ?? []).slice(0, 3) : []);
  const hasAny = $derived(items.length > 0);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  /** Relative "n days/hours ago" for an ISO timestamp. @param {string} ts */
  function ago(ts) {
    const then = new Date(ts).getTime();
    if (Number.isNaN(then)) return "";
    const diff = then - Date.now();
    const day = 86_400_000;
    if (Math.abs(diff) >= day) return rtf.format(Math.round(diff / day), "day");
    if (Math.abs(diff) >= 3_600_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
    return rtf.format(Math.round(diff / 60_000), "minute");
  }

  /** @param {import('../lib/widgets').GhItem} item */
  function verb(item) {
    return item.type === "ReleaseEvent" ? labels.release : labels.push;
  }

  onMount(async () => {
    try {
      const res = await fetch("/api/widgets", { headers: { accept: "application/json" } });
      if (res.ok) data = await res.json();
    } catch {
      /* keep the SSR snapshot */
    }
  });
</script>

{#if hasAny}
  <section class="page gh-block">
    <h2 class="gh-head">{labels.title}</h2>
    <ul class="gh-list">
      {#each items as item (item.repo + item.ts)}
        <li class="gh-item">
          <span class="gh-line">
            <span class="gh-verb">{verb(item)}</span>
            <a
              class="gh-repo"
              href={`https://github.com/${item.repo}`}
              target="_blank"
              rel="noopener noreferrer">{item.repo}</a
            >
            {#if item.detail}
              <span class="gh-detail">· {item.detail}</span>
            {/if}
          </span>
          <time class="gh-ago" datetime={item.ts}>{ago(item.ts)}</time>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .gh-block {
    padding-block-end: clamp(2rem, 6vw, 3.5rem);
  }
  .gh-head {
    font-size: var(--text-h3);
    margin-block-end: 1.25rem;
  }
  .gh-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .gh-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--surface);
  }
  .gh-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    min-inline-size: 0;
  }
  .gh-verb {
    color: var(--muted);
  }
  .gh-repo {
    color: var(--text);
    font-weight: 600;
    word-break: break-word;
  }
  .gh-repo:hover {
    color: var(--accent);
  }
  .gh-detail {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .gh-ago {
    flex: none;
    color: var(--muted);
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
</style>

<script>
  import { onMount } from "svelte";

  /**
   * @type {{
   *   labels: {
   *     title: string, latestVideo: string, nowPlaying: string,
   *     playLabel: string, hoursTwoWeeks: string, na: string
   *   },
   *   initial: import('../lib/widgets').WidgetsPayload
   * }}
   */
  let { labels, initial } = $props();

  let data = $state(initial);
  let playing = $state(false); // YouTube facade: false = thumbnail, true = nocookie iframe

  // A source counts as present only when its status is not "na" (and it has an item).
  const video = $derived(data.status?.yt !== "na" ? (data.yt?.items?.[0] ?? null) : null);
  const game = $derived(data.status?.steam !== "na" ? (data.steam?.items?.[0] ?? null) : null);
  const hasAny = $derived(Boolean(video) || Boolean(game));

  /** @param {number} min */
  function hours(min) {
    const h = Math.round((min / 60) * 10) / 10;
    return labels.hoursTwoWeeks.replace("{h}", String(h));
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
  <section class="page w-block">
    <h2 class="w-head">{labels.title}</h2>
    <div class="w-grid">
      {#if video}
        <article class="w-card">
          <div class="w-media">
            {#if playing}
              <iframe
                title={video.title}
                src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowfullscreen
              ></iframe>
            {:else}
              <img src={video.thumb} alt="" loading="lazy" width="480" height="270" />
              <button
                type="button"
                class="w-play"
                aria-label={labels.playLabel}
                onclick={() => (playing = true)}
              >
                ▶
              </button>
            {/if}
          </div>
          <div class="w-body">
            <span class="w-kicker">{labels.latestVideo}</span>
            <h3 class="w-title">{video.title}</h3>
          </div>
        </article>
      {/if}

      {#if game}
        <article class="w-card">
          <div class="w-body">
            <span class="w-kicker">{labels.nowPlaying}</span>
            <div class="w-game">
              {#if game.icon}
                <img class="w-icon" src={game.icon} alt="" width="32" height="32" loading="lazy" />
              {/if}
              <div>
                <h3 class="w-title">{game.name}</h3>
                <p class="w-meta">{hours(game.playtime2w)}</p>
              </div>
            </div>
          </div>
        </article>
      {/if}
    </div>
  </section>
{/if}

<style>
  /* `.page` (page gutters) is a global class from src/styles/global.css and is left
     un-scoped by Svelte. The rules below replicate the site .block / .card recipes. */
  .w-block {
    padding-block-end: clamp(2rem, 6vw, 3.5rem);
  }
  .w-head {
    font-size: var(--text-h3);
    margin-block-end: 1.25rem;
  }
  .w-grid {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) {
    .w-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .w-card {
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--surface);
    overflow: clip;
    transition:
      transform var(--duration-fast) var(--ease-site),
      border-color var(--duration-fast) var(--ease-site);
  }
  .w-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  }
  .w-media {
    position: relative;
    aspect-ratio: 16 / 9;
  }
  .w-media img,
  .w-media iframe {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    border: 0;
    object-fit: cover;
  }
  .w-play {
    position: absolute;
    inset: 0;
    margin: auto;
    inline-size: 3.25rem;
    block-size: 3.25rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--elevated);
    color: var(--text);
    cursor: pointer;
    font-size: 1.1rem;
  }
  .w-play:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .w-body {
    padding: 1rem 1.1rem 1.15rem;
  }
  .w-kicker {
    color: var(--muted);
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
  .w-title {
    font-size: var(--text-lead);
    font-weight: 700;
    line-height: 1.25;
    margin-block-start: 0.3rem;
  }
  .w-game {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-block-start: 0.3rem;
  }
  .w-icon {
    border-radius: var(--radius-control);
  }
  .w-meta {
    color: var(--muted);
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
    margin-block-start: 0.15rem;
  }
</style>

<script>
  import { onMount } from "svelte";

  /**
   * @type {{
   *   strings: { line1: string, line2: string, line3: string, ack: string },
   *   links: { href: string, label: string }[]
   * }}
   */
  let { strings, links = [] } = $props();

  // Bump when the legal texts change materially → the sheet reappears for everyone.
  const VERSION = 1;
  let visible = $state(false);

  function dismiss() {
    visible = false;
    try {
      localStorage.setItem("legalAck", JSON.stringify({ v: VERSION, ts: Date.now() }));
    } catch {
      /* private mode */
    }
  }

  onMount(() => {
    try {
      const raw = localStorage.getItem("legalAck");
      if (raw) {
        const ack = JSON.parse(raw);
        if (ack && typeof ack.v === "number" && ack.v >= VERSION) return;
      }
    } catch {
      /* ignore */
    }
    // 800ms after the page is interactive (docs 05 §5).
    const timer = setTimeout(() => {
      visible = true;
    }, 800);
    const onKey = (e) => {
      if (e.key === "Escape" && visible) dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if visible}
  <aside class="gate" role="note" aria-label="Legal notice">
    <div class="gate-body">
      <p>{strings.line1}</p>
      <p>{strings.line2}</p>
      <p>{strings.line3}</p>
      <nav class="gate-links" aria-label="Legal links">
        {#each links as l (l.href)}
          <a href={l.href}>{l.label}</a>
        {/each}
      </nav>
    </div>
    <button type="button" class="gate-ack" onclick={dismiss}>{strings.ack}</button>
  </aside>
{/if}

<style>
  .gate {
    position: fixed;
    z-index: 55;
    inset-inline: 0;
    inset-block-end: 0;
    /* Does NOT block scroll — no backdrop; only the card is interactive. */
    max-block-size: 40vh;
    overflow-y: auto;
    padding: 1rem 1.15rem calc(1rem + env(safe-area-inset-bottom, 0));
    background: var(--elevated);
    border-block-start: 1px solid var(--line);
    box-shadow: var(--shadow-elevated);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: gate-in 0.35s var(--ease-site) both;
  }
  @keyframes gate-in {
    from {
      transform: translateY(100%);
    }
    to {
      transform: none;
    }
  }
  .gate-body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--muted);
    font-size: var(--text-meta);
    line-height: 1.5;
  }
  .gate-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.85rem;
    margin-block-start: 0.35rem;
  }
  .gate-links a {
    color: var(--accent);
    font-family: var(--ff-mono);
  }
  .gate-ack {
    align-self: flex-start;
    padding: 0.5rem 1.1rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .gate-ack:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  @media (min-width: 768px) {
    .gate {
      inset-inline-start: auto;
      inset-inline-end: 1.5rem;
      inset-block-end: 1.5rem;
      inline-size: min(24rem, 90vw);
      border: 1px solid var(--line);
      border-radius: var(--radius-modal);
    }
  }
</style>

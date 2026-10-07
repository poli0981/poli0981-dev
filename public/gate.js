// Turnstile gate client (served as a static file so the page's existing CSP — 'self' plus
// challenges.cloudflare.com — allows it without a hash). Renders the widget, trades the
// token for the 48-hour pass cookie at /api/gate, then reloads into the real page.
// See src/lib/gate/render.ts for the markup this drives.
(() => {
  const root = document.querySelector("[data-human-check]");
  if (!root) return;
  const status = root.querySelector(".human-check-status");
  const retry = root.querySelector(".human-check-retry");
  const say = (key) => {
    status.textContent = root.dataset[key] || "";
  };
  const offerRetry = () => {
    retry.hidden = false;
  };
  retry.addEventListener("click", () => location.reload());

  const loadTurnstile = () =>
    new Promise((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
      script.onerror = reject;
      document.head.appendChild(script);
    });

  const verify = async (token) => {
    say("msgVerifying");
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      });
      if (res.status === 204) {
        say("msgOk");
        location.reload();
        return;
      }
      say(res.status === 429 ? "msgSlowDown" : "msgError");
    } catch {
      say("msgError");
    }
    offerRetry();
  };

  loadTurnstile()
    .then((turnstile) => {
      const id = turnstile.render("#human-check-widget", {
        sitekey: root.dataset.sitekey,
        action: "gate",
        language: root.dataset.lang,
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        callback: verify,
        "error-callback": () => {
          say("msgError");
          offerRetry();
        },
        "expired-callback": () => turnstile.reset(id),
      });
    })
    .catch(() => {
      say("msgLoadFailed");
      offerRetry();
    });
})();

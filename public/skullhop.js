/**
 * Skull Hop — the offline mini-game (docs 09 §4).
 *
 * Lives in public/ at a STABLE url rather than being bundled by Astro, because the
 * service worker precaches it by name. A hashed /_astro/ chunk could not be precached
 * (the filename changes every build) and the SW only warms those on first fetch — which
 * for a page nobody visits while online means the game would 404 exactly when needed.
 *
 * No sprite file for the same reason: one more thing to precache and to 404. The skull is
 * drawn from a pixel grid below, which also keeps it crisp at any DPR.
 *
 * Vanilla, no imports, no build step. Loaded with <script src defer> so CSP 'self' covers
 * it without a hash.
 */
(() => {
  const canvas = document.getElementById("skullhop");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const startBtn = document.getElementById("skullhop-start");
  const scoreEl = document.getElementById("skullhop-score");
  const bestEl = document.getElementById("skullhop-best");

  const W = 320;
  const H = 120;
  const GROUND = H - 18;
  const KEY = "skullhop";

  // 8x8 pixel skull. 1 = bone, 2 = eye socket / mouth gap.
  const SKULL = [
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 1, 1, 2, 2, 1],
    [1, 2, 2, 1, 1, 2, 2, 1],
    [1, 1, 1, 2, 2, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 2, 1, 2, 1, 2, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
  ];

  const css = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  let bone = css("--text", "#e9e4d9");
  let accent = css("--accent", "#e8a33d");
  let line = css("--line", "#2a2f3a");
  let muted = css("--muted", "#8b93a1");

  let best = 0;
  try {
    best = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    /* private mode — best score just won't persist */
  }
  if (bestEl) bestEl.textContent = String(best);

  let running = false;
  let raf = 0;
  let y = 0; // height above ground
  let vy = 0;
  let score = 0;
  let speed = 1.6;
  let bars = [];
  let t = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  function drawSkull(px, py, size) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const v = SKULL[r][c];
        if (!v) continue;
        ctx.fillStyle = v === 1 ? bone : line;
        ctx.fillRect(px + c * size, py + r * size, size, size);
      }
    }
  }

  function reset() {
    y = 0;
    vy = 0;
    score = 0;
    speed = 1.6;
    t = 0;
    bars = [];
    if (scoreEl) scoreEl.textContent = "0";
  }

  function jump() {
    if (!running) {
      start();
      return;
    }
    if (y === 0) vy = 4.6;
  }

  function gameOver() {
    running = false;
    cancelAnimationFrame(raf);
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(KEY, String(best));
      } catch {
        /* ignore */
      }
      if (bestEl) bestEl.textContent = String(best);
    }
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.textContent = startBtn.dataset.again || "Again";
      startBtn.focus();
    }
    ctx.fillStyle = muted;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(canvas.dataset.over || "Game over", W / 2, 28);
  }

  function frame() {
    t += 1;
    speed += 0.0016; // ramps up, docs 09 §4

    // physics
    vy -= 0.26;
    y += vy;
    if (y <= 0) {
      y = 0;
      vy = 0;
    }

    // spawn waveform bars with a gap that stays clearable
    const last = bars[bars.length - 1];
    if (!last || last.x < W - (90 + Math.random() * 70)) {
      bars.push({ x: W + 8, h: 10 + Math.random() * 16 });
    }
    for (const b of bars) b.x -= speed;
    if (bars.length && bars[0].x < -12) {
      bars.shift();
      score += 1;
      if (scoreEl) scoreEl.textContent = String(score);
    }

    // draw
    ctx.clearRect(0, 0, W, H);

    // ground
    ctx.fillStyle = line;
    ctx.fillRect(0, GROUND + 10, W, 1);

    // background waveline, the site motif
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const yy = 30 + Math.sin((x + t * 1.5) / 22) * 6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    // obstacles
    ctx.fillStyle = accent;
    for (const b of bars) ctx.fillRect(b.x, GROUND + 10 - b.h, 5, b.h);

    // skull
    const sx = 34;
    const sy = GROUND + 10 - 16 - y;
    drawSkull(sx, sy, 2);

    // collision — skull box is 16x16 at (sx, sy)
    for (const b of bars) {
      if (b.x < sx + 15 && b.x + 5 > sx && GROUND + 10 - b.h < sy + 16) {
        gameOver();
        return;
      }
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    reset();
    running = true;
    if (startBtn) startBtn.hidden = true;
    raf = requestAnimationFrame(frame);
  }

  // Idle frame so the canvas is never blank before the first play.
  function idle() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = line;
    ctx.fillRect(0, GROUND + 10, W, 1);
    drawSkull(34, GROUND - 6, 2);
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.isContentEditable)) return;
      e.preventDefault();
      jump();
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    jump();
  });
  startBtn?.addEventListener("click", start);

  idle();

  // docs 09 §4: reduced motion means it must not start on its own. It never does —
  // the button is always the entry point — but this keeps the canvas static and makes
  // the intent explicit rather than incidental.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && startBtn) {
    startBtn.hidden = false;
  }
})();

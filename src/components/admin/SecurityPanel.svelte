<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { ago, dateTime } from "./format";
  import { confirmAction, toast } from "./ui";

  /** @typedef {import("@/lib/denylist").DenyEntry} DenyEntry */
  /** @typedef {import("@/lib/admin/status").ConfigStatus} ConfigStatus */

  /** @type {DenyEntry[]} */
  let denylist = $state([]);
  /** @type {ConfigStatus | null} */
  let config = $state(null);
  let error = $state("");
  let busy = $state(false);

  // New entry
  let cidr = $state("");
  let reason = $state("");
  let duration = $state("24");

  /** What each secret is for, so a missing one says what stops working. */
  /** @type {Record<string, string>} */
  const SECRET_ROLES = {
    GITHUB_CONTENT_TOKEN: "lưu nội dung từ admin",
    GITHUB_PUBLISH_TOKEN: "xuất bản (token riêng, chỉ quyền Actions)",
    GITHUB_ISSUES_TOKEN: "báo lỗi → issue GitHub riêng tư",
    DISCORD_WEBHOOK_BUG: "báo lỗi → Discord",
    TURNSTILE_SECRET: "Turnstile (cổng + báo lỗi)",
    GATE_SECRET: "ký cookie của cổng Turnstile",
    ADMIN_EMAILS: "danh sách email được vào admin",
  };

  const now = Date.now();
  /** @param {DenyEntry} entry */
  const expired = (entry) => Boolean(entry.until) && Date.parse(entry.until ?? "") <= now;

  async function load() {
    error = "";
    try {
      ({ denylist, config } = await api("/api/admin/security"));
    } catch (e) {
      error = describeError(e);
    }
  }

  async function add() {
    busy = true;
    try {
      const body = {
        cidr: cidr.trim(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(duration ? { hours: Number(duration) } : {}),
      };
      ({ denylist } = await api("/api/admin/security", "POST", body));
      toast(`Đã chặn ${body.cidr} — có hiệu lực trong khoảng một phút.`);
      cidr = "";
      reason = "";
    } catch (e) {
      toast(describeError(e), "error");
    } finally {
      busy = false;
    }
  }

  /** @param {DenyEntry} entry */
  async function remove(entry) {
    if (!(await confirmAction(`Bỏ chặn ${entry.cidr}?`, { confirmLabel: "Bỏ chặn" }))) return;
    try {
      ({ denylist } = await api("/api/admin/security", "DELETE", { cidr: entry.cidr }));
      toast(`Đã bỏ chặn ${entry.cidr}.`);
    } catch (e) {
      toast(describeError(e), "error");
    }
  }

  onMount(load);
</script>

<div class="page-head">
  <div>
    <h1>Bảo mật</h1>
    <p>Danh sách chặn IP áp dụng cho mọi host (cả admin), đổi có hiệu lực trong khoảng một phút.</p>
  </div>
</div>

{#if error}
  <div class="card">
    <p class="error-text">{error}</p>
    <button type="button" onclick={load}>Thử lại</button>
  </div>
{:else}
  <div class="cols">
    <section class="card">
      <h2>Chặn địa chỉ IP</h2>
      <form
        class="add"
        onsubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label
          >Địa chỉ hoặc dải CIDR
          <input
            bind:value={cidr}
            required
            placeholder="203.0.113.7 hoặc 2001:db8::/64"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label
          >Lý do <input bind:value={reason} maxlength="200" placeholder="vd. cào dữ liệu" /></label
        >
        <label
          >Thời hạn
          <select bind:value={duration}>
            <option value="1">1 giờ</option>
            <option value="24">1 ngày</option>
            <option value="168">7 ngày</option>
            <option value="720">30 ngày</option>
            <option value="">Đến khi gỡ</option>
          </select>
        </label>
        <button type="submit" class="primary" disabled={busy || !cidr.trim()}>Chặn</button>
      </form>

      {#if denylist.length === 0}
        <p class="muted">Chưa chặn địa chỉ nào.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">Dải</th>
              <th scope="col">Lý do</th>
              <th scope="col">Hết hạn</th>
              <th scope="col"><span class="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {#each denylist as entry (entry.cidr)}
              <tr class:expired={expired(entry)}>
                <td><code>{entry.cidr}</code></td>
                <td>{entry.reason ?? "—"}</td>
                <td title={dateTime(entry.until)}>
                  {entry.until ? (expired(entry) ? "đã hết hạn" : ago(entry.until)) : "không"}
                </td>
                <td
                  ><button type="button" class="danger" onclick={() => remove(entry)}>Gỡ</button
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    {#if config}
      <section class="card">
        <h2>Cấu hình</h2>
        <p>
          Cổng Turnstile:
          <span class="pill" data-tone={config.gate.active ? "ok" : "warn"}>
            {config.gate.active
              ? `bật (${config.gate.mode})`
              : `tắt (GATE_MODE=${config.gate.mode})`}
          </span>
        </p>
        <ul class="secrets">
          {#each Object.entries(config.secrets) as [name, set] (name)}
            <li>
              <span class="pill" data-tone={set ? "ok" : "warn"}>{set ? "đã đặt" : "thiếu"}</span>
              <code>{name}</code>
              <span class="muted small">{SECRET_ROLES[name] ?? ""}</span>
            </li>
          {/each}
        </ul>
        {#if config.singleToken}
          <p class="small warn">
            Xuất bản đang dùng GITHUB_CONTENT_TOKEN, nghĩa là token đó có quyền trên repo site. Tạo
            GITHUB_PUBLISH_TOKEN (chỉ Actions: Read and write trên poli0981-dev) rồi thu hẹp token
            nội dung về repo content.
          </p>
        {/if}
        <p class="muted small">
          Giới hạn tốc độ mỗi IP / phút: báo lỗi 5, cổng 30, admin 120, API khác 120
          (wrangler.jsonc).
        </p>
      </section>
    {/if}
  </div>
{/if}

<style>
  .cols {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
    align-items: start;
  }
  .add {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    align-items: end;
    margin-block-end: 1rem;
  }
  .add label {
    display: grid;
    gap: 0.25rem;
    color: var(--muted);
    font-size: var(--text-meta);
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-meta);
  }
  th,
  td {
    padding: 0.45rem 0.4rem;
    border-block-end: 1px solid var(--line);
    text-align: start;
    vertical-align: middle;
  }
  thead th {
    color: var(--muted);
    font-weight: 500;
  }
  tr.expired td {
    color: var(--muted);
  }
  .secrets {
    display: grid;
    gap: 0.45rem;
    margin: 0.5rem 0;
    padding: 0;
    list-style: none;
  }
  .secrets li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .small {
    font-size: var(--text-meta);
  }
  .warn {
    color: var(--warn);
  }
</style>

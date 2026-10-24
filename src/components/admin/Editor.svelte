<script>
  import { onMount } from "svelte";
  import { marked } from "marked";
  import { api, ApiError, describeError } from "./api";
  import MediaPicker from "./MediaPicker.svelte";
  import { confirmAction, toast } from "./ui";
  import { dateTime } from "./format";
  import { collectionOf, newEntryPath, validateFrontmatter } from "@/lib/admin/collections";
  import { mediaFallbackSrc, mediaPictureHtml } from "@/lib/media";

  /** @type {{ path?: string | null; create?: { collection: string; slug: string; lang: string; series?: string } | null }} */
  let { path = null, create = null } = $props();

  const filePath =
    path ??
    (create
      ? newEntryPath(/** @type {any} */ (create.collection), create.slug, create.series)
      : null);
  const spec = filePath ? collectionOf(filePath) : null;
  /** Unsaved work survives a reload, a lapsed session or a crash under this key. */
  const draftKey = `admin:draft:${filePath}`;

  /** @type {Record<string, any>} */
  let data = $state({});
  let body = $state("");
  /** @type {string | null} */
  let sha = $state(null);
  /** A new entry turns into a normal edit after its first save. */
  let isNew = $state(!path);
  let loading = $state(Boolean(path));
  let loadError = $state("");
  let saving = $state(false);
  let dirty = $state(false);
  let triedSave = $state(false);
  let tab = $state("edit");
  /** @type {{ data: Record<string, any>; body: string; sha: string | null; at: string } | null} */
  let restorable = $state(null);
  /** @type {"insert" | "cover" | null} */
  let picking = $state(null);
  /** @type {HTMLTextAreaElement | undefined} */
  let textarea = $state();

  const errors = $derived(spec ? validateFrontmatter(spec, data) : []);
  /** @type {Record<string, string>} */
  const fieldError = $derived(
    Object.fromEntries(
      errors.map((e) => {
        const field = spec?.fields.find((f) => f.key === e.field);
        const message = {
          required: "Bắt buộc.",
          type: "Sai kiểu dữ liệu.",
          option: "Chọn một giá trị trong danh sách.",
          max: `Tối đa ${field?.max ?? ""} ký tự.`,
          format: field?.type === "url" ? "Cần một URL http(s)." : "Sai định dạng.",
        }[e.code];
        return [e.field, message];
      }),
    ),
  );
  const today = () => new Date().toISOString().slice(0, 10);

  // --- preview: rendered in a sandboxed frame. No allow-scripts, so nothing in the
  // Markdown can run; allow-same-origin only so the page's stylesheets and /media images
  // load with the Access cookie. The frame inherits this page's CSP, and the copied <style>
  // blocks match its hashes.
  const previewDoc = $derived.by(() => {
    if (tab !== "preview") return "";
    const html = /** @type {string} */ (marked.parse(body, { async: false }));
    const head = [...document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((node) => node.outerHTML)
      .join("");
    const theme = document.documentElement.dataset.theme ?? "dark";
    return `<!doctype html><html lang="${data.lang ?? "vi"}" data-theme="${theme}"><head><meta charset="utf-8">${head}</head><body class="admin preview-body"><article class="prose">${html}</article></body></html>`;
  });

  function readDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* private mode */
    }
  }

  // Debounced local copy of unsaved work.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let draftTimer;
  $effect(() => {
    if (!dirty) return;
    const snapshot = { data: $state.snapshot(data), body, sha, at: new Date().toISOString() };
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(snapshot));
      } catch {
        /* storage full or blocked — the beforeunload guard still protects the work */
      }
    }, 800);
  });

  onMount(() => {
    if (!filePath || !spec) return;
    if (isNew && create) {
      data = { lang: create.lang };
      for (const field of spec.fields) {
        if (field.type === "date" && field.required) data[field.key] = today();
        if (field.key === "draft") data.draft = true;
        if (field.key === "series" && create.series) data.series = create.series;
      }
      if (spec.id === "projects") data.year = new Date().getFullYear();
      restorable = readDraft();
    } else {
      void load();
    }
    const guard = (/** @type {BeforeUnloadEvent} */ event) => {
      if (dirty) event.preventDefault();
    };
    const shortcut = (/** @type {KeyboardEvent} */ event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving && !loading && !loadError) void save();
      }
    };
    addEventListener("beforeunload", guard);
    addEventListener("keydown", shortcut);
    return () => {
      removeEventListener("beforeunload", guard);
      removeEventListener("keydown", shortcut);
    };
  });

  async function load() {
    loading = true;
    loadError = "";
    try {
      const file = await api(
        `/api/admin/content?path=${encodeURIComponent(/** @type {string} */ (filePath))}`,
      );
      data = file.frontmatter;
      body = file.body;
      sha = file.sha;
      dirty = false;
      const draft = readDraft();
      // Offer a local copy only when it differs from what the repo now holds.
      if (draft && (draft.body !== body || JSON.stringify(draft.data) !== JSON.stringify(data))) {
        restorable = draft;
      }
    } catch (error) {
      loadError = describeError(error);
    } finally {
      loading = false;
    }
  }

  function restore() {
    if (!restorable) return;
    data = restorable.data;
    body = restorable.body;
    if (restorable.sha && restorable.sha !== sha) {
      toast(
        "Bản nháp được viết trên một phiên bản cũ hơn — lưu sẽ báo xung đột, hãy chép lại phần cần giữ.",
        "info",
      );
    }
    restorable = null;
    dirty = true;
  }

  function discard() {
    clearDraft();
    restorable = null;
  }

  function touch() {
    dirty = true;
  }

  async function save() {
    triedSave = true;
    if (errors.length > 0) {
      toast(`Chưa lưu: ${errors.length} trường cần sửa.`, "error");
      return;
    }
    saving = true;
    try {
      const result = await api("/api/admin/content", "PUT", {
        path: filePath,
        sha,
        frontmatter: data,
        body,
      });
      sha = result.sha;
      dirty = false;
      clearDraft();
      toast("Đã lưu vào repo nội dung — bấm “Xuất bản” để đưa lên site.");
      if (isNew) {
        isNew = false;
        history.replaceState(
          null,
          "",
          `/admin/edit/?path=${encodeURIComponent(/** @type {string} */ (filePath))}`,
        );
      }
    } catch (error) {
      toast(
        error instanceof ApiError && error.data.error === "conflict"
          ? "File đã bị sửa ở nơi khác (vd. GitHub). Bản đang viết vẫn còn trên máy — tải lại trang rồi chọn “Khôi phục”."
          : describeError(error),
        "error",
      );
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!sha) return;
    const ok = await confirmAction(`Xoá ${filePath}? Vẫn khôi phục được từ lịch sử Git.`, {
      confirmLabel: "Xoá",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/admin/content", "DELETE", { path: filePath, sha });
      dirty = false;
      clearDraft();
      location.href = "/admin/content/";
    } catch (error) {
      toast(describeError(error), "error");
    }
  }

  /** @param {import("./api").MediaItem} item */
  function picked(item) {
    if (picking === "cover") {
      data.coverMedia = {
        id: item.id,
        w: item.w,
        h: item.h,
        ...(item.alt ? { alt: item.alt } : {}),
      };
    } else if (textarea) {
      const snippet = `\n\n${mediaPictureHtml(item, item.alt)}\n\n`;
      const start = textarea.selectionStart;
      body = body.slice(0, start) + snippet + body.slice(textarea.selectionEnd);
    }
    picking = null;
    touch();
  }

  /** @param {string} key @param {string} value */
  function setTags(key, value) {
    data[key] = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    touch();
  }

  /** @param {string} key */
  const invalid = (key) => triedSave && key in fieldError;
</script>

{#if !spec}
  <div class="card">
    <p class="error-text">Đường dẫn không hợp lệ hoặc admin không được sửa mục này.</p>
    <a href="/admin/content/">← Về danh sách nội dung</a>
  </div>
{:else}
  <div class="bar">
    <div>
      <p class="crumb"><a href="/admin/content/">Nội dung</a> / {spec.label}</p>
      <h1>{isNew ? "Tạo mới" : "Sửa"} <code>{filePath}</code></h1>
    </div>
    <div class="actions">
      <span class="state" aria-live="polite">
        {saving ? "Đang lưu…" : dirty ? "Có thay đổi chưa lưu" : isNew ? "" : "Đã lưu"}
      </span>
      {#if !isNew}<button type="button" class="danger" onclick={remove}>Xoá</button>{/if}
      <button
        type="button"
        class="primary"
        onclick={save}
        disabled={saving || loading || Boolean(loadError)}
        aria-keyshortcuts="Control+S Meta+S"
        title="Lưu (Ctrl/⌘+S)">Lưu</button
      >
    </div>
  </div>

  {#if restorable}
    <div class="restore card" role="status">
      <span>Có bản nháp chưa lưu trên máy này ({dateTime(restorable.at)}).</span>
      <button type="button" class="primary" onclick={restore}>Khôi phục</button>
      <button type="button" onclick={discard}>Bỏ</button>
    </div>
  {/if}

  {#if loading}
    <div class="layout" aria-busy="true" aria-label="Đang tải">
      <div class="skeleton fields-skeleton"></div>
      <div class="skeleton body-skeleton"></div>
    </div>
  {:else if loadError}
    <div class="card">
      <p class="error-text">Không tải được {filePath}: {loadError}</p>
      <button type="button" onclick={load}>Thử lại</button>
    </div>
  {:else}
    <div class="layout">
      <form class="fields" onsubmit={(event) => event.preventDefault()} oninput={touch} novalidate>
        {#each spec.fields as field (field.key)}
          {@const errorId = `err-${field.key}`}
          <div class="field">
            {#if field.type === "checkbox"}
              <label class="check"
                ><input type="checkbox" bind:checked={data[field.key]} /> {field.label}</label
              >
            {:else if field.type === "media"}
              <span class="label">{field.label}</span>
              {#if data[field.key]?.id}
                <img class="cover" src={mediaFallbackSrc(data[field.key])} alt="" />
                <div class="row">
                  <button type="button" onclick={() => (picking = "cover")}>Đổi ảnh</button>
                  <button type="button" onclick={() => ((data[field.key] = undefined), touch())}
                    >Bỏ</button
                  >
                </div>
              {:else}
                <button type="button" onclick={() => (picking = "cover")}>Chọn ảnh bìa</button>
              {/if}
            {:else}
              <label>
                <span class="label">{field.label}{field.required ? " *" : ""}</span>
                {#if field.type === "textarea"}
                  <textarea
                    rows="3"
                    maxlength={field.max}
                    bind:value={data[field.key]}
                    aria-invalid={invalid(field.key)}
                    aria-describedby={invalid(field.key) ? errorId : undefined}></textarea>
                {:else if field.type === "select"}
                  <select
                    bind:value={data[field.key]}
                    aria-invalid={invalid(field.key)}
                    aria-describedby={invalid(field.key) ? errorId : undefined}
                  >
                    <option value={undefined}>—</option>
                    {#each field.options ?? [] as option (option)}<option value={option}
                        >{option}</option
                      >{/each}
                  </select>
                {:else if field.type === "tags"}
                  <input
                    value={(data[field.key] ?? []).join(", ")}
                    onchange={(event) => setTags(field.key, event.currentTarget.value)}
                    placeholder="cách nhau bởi dấu phẩy"
                  />
                {:else if field.type === "number"}
                  <input
                    type="number"
                    value={data[field.key] ?? ""}
                    aria-invalid={invalid(field.key)}
                    aria-describedby={invalid(field.key) ? errorId : undefined}
                    oninput={(event) => {
                      const v = event.currentTarget.value;
                      data[field.key] = v === "" ? undefined : Number(v);
                    }}
                  />
                {:else if field.type === "date"}
                  <input
                    type="date"
                    bind:value={data[field.key]}
                    aria-invalid={invalid(field.key)}
                    aria-describedby={invalid(field.key) ? errorId : undefined}
                  />
                {:else}
                  <input
                    type={field.type === "url" ? "url" : "text"}
                    maxlength={field.max}
                    bind:value={data[field.key]}
                    aria-invalid={invalid(field.key)}
                    aria-describedby={invalid(field.key) ? errorId : undefined}
                  />
                {/if}
              </label>
              {#if invalid(field.key)}
                <span class="field-error" id={errorId}>{fieldError[field.key]}</span>
              {:else if field.hint}
                <span class="hint">{field.hint}</span>
              {/if}
            {/if}
          </div>
        {/each}
      </form>

      <div class="body">
        <div class="tabs">
          <div role="tablist" aria-label="Thân bài">
            <button
              type="button"
              role="tab"
              id="tab-edit"
              aria-controls="panel-edit"
              aria-selected={tab === "edit"}
              tabindex={tab === "edit" ? 0 : -1}
              onclick={() => (tab = "edit")}>Soạn</button
            >
            <button
              type="button"
              role="tab"
              id="tab-preview"
              aria-controls="panel-preview"
              aria-selected={tab === "preview"}
              tabindex={tab === "preview" ? 0 : -1}
              onclick={() => (tab = "preview")}>Xem trước</button
            >
          </div>
          <button type="button" class="insert" onclick={() => (picking = "insert")}>Chèn ảnh</button
          >
        </div>
        {#if tab === "edit"}
          <div role="tabpanel" id="panel-edit" aria-labelledby="tab-edit">
            <textarea
              class="markdown"
              bind:this={textarea}
              bind:value={body}
              oninput={touch}
              aria-label="Nội dung Markdown"
              spellcheck="true"></textarea>
          </div>
        {:else}
          <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview">
            <iframe
              class="preview"
              title="Xem trước bài viết"
              sandbox="allow-same-origin"
              srcdoc={previewDoc}
            ></iframe>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <MediaPicker open={picking !== null} onpick={picked} onclose={() => (picking = null)} />
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }
  .crumb {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .crumb a:hover {
    color: var(--accent);
  }
  h1 {
    margin: 0.15rem 0 0;
    font-size: var(--text-lead);
  }
  h1 code {
    color: var(--muted);
    font-size: var(--text-meta);
    overflow-wrap: anywhere;
  }
  .actions,
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .state {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .restore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-block-start: 0.75rem;
    border-color: var(--warn);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(16rem, 22rem) 1fr;
    gap: 1.5rem;
    margin-block-start: 1rem;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .fields-skeleton {
    block-size: 24rem;
  }
  .body-skeleton {
    block-size: 65vh;
  }
  .fields {
    display: grid;
    gap: 0.9rem;
    align-content: start;
  }
  .field label {
    display: grid;
    gap: 0.3rem;
  }
  .label,
  .hint {
    font-size: var(--text-meta);
    color: var(--muted);
  }
  .field-error {
    font-size: var(--text-meta);
    color: var(--err);
  }
  .check {
    display: flex !important;
    align-items: center;
    gap: 0.5rem;
  }
  .cover {
    display: block;
    inline-size: 100%;
    max-block-size: 10rem;
    object-fit: cover;
    border-radius: var(--radius-control);
    margin-block: 0.4rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-block-end: 0.5rem;
  }
  .tabs [role="tablist"] {
    display: flex;
    gap: 0.25rem;
  }
  .tabs [aria-selected="true"] {
    border-color: var(--accent);
    color: var(--accent);
  }
  .insert {
    margin-inline-start: auto;
  }
  .markdown {
    inline-size: 100%;
    min-block-size: 65vh;
    font-family: var(--ff-mono);
    font-size: 0.95rem;
    line-height: 1.6;
  }
  .preview {
    display: block;
    inline-size: 100%;
    min-block-size: 65vh;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--bg);
  }
</style>

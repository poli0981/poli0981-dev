<script>
  import { onMount } from "svelte";
  import { marked } from "marked";
  import { api, ApiError, describeError } from "./api";
  import MediaPicker from "./MediaPicker.svelte";
  import { collectionOf, newEntryPath } from "@/lib/admin/collections";
  import { mediaFallbackSrc, mediaPictureHtml } from "@/lib/media";

  /** @type {{ path?: string | null; create?: { collection: string; slug: string; lang: string; series?: string } | null }} */
  let { path = null, create = null } = $props();

  const filePath =
    path ??
    (create
      ? newEntryPath(/** @type {any} */ (create.collection), create.slug, create.series)
      : null);
  const spec = filePath ? collectionOf(filePath) : null;
  const isNew = !path;

  /** @type {Record<string, any>} */
  let data = $state({});
  let body = $state("");
  /** @type {string | null} */
  let sha = $state(null);
  let loading = $state(!isNew);
  let saving = $state(false);
  let dirty = $state(false);
  let status = $state("");
  let tab = $state("edit");
  /** @type {"insert" | "cover" | null} */
  let picking = $state(null);
  /** @type {HTMLTextAreaElement | undefined} */
  let textarea = $state();

  const preview = $derived(
    tab === "preview" ? /** @type {string} */ (marked.parse(body, { async: false })) : "",
  );
  const today = () => new Date().toISOString().slice(0, 10);

  onMount(() => {
    if (!filePath || !spec) {
      status = "Đường dẫn không hợp lệ.";
      return;
    }
    if (isNew && create) {
      data = { lang: create.lang };
      for (const field of spec.fields) {
        if (field.type === "date" && field.required) data[field.key] = today();
        if (field.key === "draft") data.draft = true;
        if (field.key === "series" && create.series) data.series = create.series;
      }
      if (spec.id === "projects") data.year = new Date().getFullYear();
    } else {
      void load();
    }
    const guard = (/** @type {BeforeUnloadEvent} */ event) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  });

  async function load() {
    loading = true;
    try {
      const file = await api(
        `/api/admin/content?path=${encodeURIComponent(/** @type {string} */ (filePath))}`,
      );
      data = file.frontmatter;
      body = file.body;
      sha = file.sha;
      dirty = false;
      status = "";
    } catch (error) {
      status = describeError(error);
    } finally {
      loading = false;
    }
  }

  function touch() {
    dirty = true;
  }

  async function save() {
    saving = true;
    status = "Đang lưu…";
    try {
      const result = await api("/api/admin/content", "PUT", {
        path: filePath,
        sha,
        frontmatter: data,
        body,
      });
      sha = result.sha;
      dirty = false;
      status = "Đã lưu vào repo nội dung — bấm “Xuất bản” để đưa lên site.";
      if (isNew)
        history.replaceState(
          null,
          "",
          `/admin/edit/?path=${encodeURIComponent(/** @type {string} */ (filePath))}`,
        );
    } catch (error) {
      status =
        error instanceof ApiError && error.status === 409
          ? "File đã bị sửa ở nơi khác (vd. GitHub). Sao chép phần đang viết rồi tải lại trang."
          : error instanceof ApiError && error.data.error === "missing_field"
            ? `Thiếu trường bắt buộc: ${error.data.field}`
            : describeError(error);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!sha || !confirm(`Xoá ${filePath}? (vẫn khôi phục được từ lịch sử Git)`)) return;
    try {
      await api("/api/admin/content", "DELETE", { path: filePath, sha });
      dirty = false;
      location.href = "/admin/";
    } catch (error) {
      status = describeError(error);
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
</script>

{#if !spec}
  <p class="error">{status || "Không mở được nội dung này."}</p>
{:else}
  <div class="bar">
    <h1>{isNew ? "Tạo" : "Sửa"} · {spec.label} <code>{filePath}</code></h1>
    <div class="actions">
      {#if !isNew}<button type="button" class="danger" onclick={remove}>Xoá</button>{/if}
      <button type="button" class="primary" onclick={save} disabled={saving || loading}>Lưu</button>
    </div>
  </div>
  {#if status}<p class="status" aria-live="polite">{status}</p>{/if}

  {#if loading}
    <p>Đang tải…</p>
  {:else}
    <div class="layout">
      <form class="fields" onsubmit={(event) => event.preventDefault()} oninput={touch}>
        {#each spec.fields as field (field.key)}
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
                  <textarea rows="3" maxlength={field.max} bind:value={data[field.key]}></textarea>
                {:else if field.type === "select"}
                  <select bind:value={data[field.key]}>
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
                    oninput={(event) => {
                      const v = event.currentTarget.value;
                      data[field.key] = v === "" ? undefined : Number(v);
                    }}
                  />
                {:else if field.type === "date"}
                  <input type="date" bind:value={data[field.key]} />
                {:else}
                  <input
                    type={field.type === "url" ? "url" : "text"}
                    maxlength={field.max}
                    bind:value={data[field.key]}
                  />
                {/if}
              </label>
              {#if field.hint}<span class="hint">{field.hint}</span>{/if}
            {/if}
          </div>
        {/each}
      </form>

      <div class="body">
        <div class="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "edit"}
            onclick={() => (tab = "edit")}>Soạn</button
          >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            onclick={() => (tab = "preview")}>Xem trước</button
          >
          <button type="button" class="insert" onclick={() => (picking = "insert")}>Chèn ảnh</button
          >
        </div>
        {#if tab === "edit"}
          <textarea
            class="markdown"
            bind:this={textarea}
            bind:value={body}
            oninput={touch}
            spellcheck="true"></textarea>
        {:else}
          <!-- Preview of the owner's own Markdown. Scripts can't run from it: innerHTML never
               executes <script>, and the page CSP (no 'unsafe-inline') blocks handlers. -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <div class="preview prose">{@html preview}</div>
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
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: var(--text-lead);
  }
  h1 code {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .actions,
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .status {
    color: var(--muted);
  }
  .error {
    color: var(--err);
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
  .fields {
    display: grid;
    gap: 0.9rem;
    align-content: start;
  }
  .field label {
    display: grid;
    gap: 0.3rem;
  }
  .label {
    font-size: var(--text-meta);
    color: var(--muted);
  }
  .hint {
    font-size: var(--text-meta);
    color: var(--muted);
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
    min-block-size: 65vh;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    overflow: auto;
  }
  .danger {
    border-color: var(--err) !important;
    color: var(--err) !important;
  }
  .primary {
    border-color: var(--accent) !important;
    color: var(--accent) !important;
  }
</style>

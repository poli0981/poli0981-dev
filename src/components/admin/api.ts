// Browser-side helpers for the admin islands: JSON calls to /api/admin/* and uploads.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: Record<string, unknown>,
  ) {
    super(String(data.message ?? data.error ?? `HTTP ${status}`));
  }
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface MediaItem {
  id: string;
  w: number;
  h: number;
  alt: string;
  name: string;
  createdAt: string;
}

/** Upload one image; the server transforms it once and stores the variants in R2. */
export async function uploadImage(
  file: File,
  alt = "",
): Promise<{ item: MediaItem; created: boolean }> {
  const form = new FormData();
  form.append("file", file);
  form.append("alt", alt);
  const res = await fetch("/api/admin/media", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as unknown as { item: MediaItem; created: boolean };
}

/** Human-readable message for an API failure. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "Xung đột: nội dung đã thay đổi ở nơi khác (hoặc ảnh đang được dùng).";
    if (error.status === 413) return "Tệp quá lớn (tối đa 20 MB).";
    if (error.status === 415) return "Định dạng ảnh không được hỗ trợ.";
    if (error.status === 429) return "Thao tác quá nhanh — đợi một phút.";
    if (error.status === 503) return "Admin chưa được cấu hình (thiếu token).";
    if (error.data.error === "github_permission") {
      const needs = error.data.needs ? ` (GitHub cần: ${String(error.data.needs)})` : "";
      return `Token GitHub thiếu quyền${needs}. Lưu bài cần GITHUB_CONTENT_TOKEN có Contents: Read and write trên poli0981/content; Xuất bản cần GITHUB_PUBLISH_TOKEN có Actions: Read and write trên poli0981/poli0981-dev.`;
    }
    if (error.data.error === "not_creatable") return "Mục này chỉ sửa được, không tạo mới.";
    return `Lỗi ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

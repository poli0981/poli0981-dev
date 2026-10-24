// Browser-side helpers for the admin islands: JSON calls to /api/admin/* and uploads.
import { sessionExpired } from "./ui";

export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(String(data.message ?? data.error ?? `HTTP ${status}`));
    this.status = status;
    this.data = data;
  }
}

/**
 * One admin API call. Access answers a lapsed session with a redirect to its login page
 * (our API never redirects, so `manual` turns that into an opaque response), and the
 * middleware answers a token it no longer accepts with 403: both mean "sign in again" —
 * AdminChrome shows the banner, and the islands keep what was typed.
 */
async function send(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, { ...init, credentials: "same-origin", redirect: "manual" });
  if (res.type === "opaqueredirect" || res.status === 403) {
    sessionExpired();
    throw new ApiError(401, { error: "session_expired" });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return (await send(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })) as T;
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
  const data = await send("/api/admin/media", { method: "POST", body: form });
  return data as unknown as { item: MediaItem; created: boolean };
}

/** Messages for the specific error codes the admin API returns (checked before statuses). */
const CODE_MESSAGES: Record<string, string> = {
  session_expired: "Phiên đăng nhập đã hết hạn — đăng nhập lại để tiếp tục.",
  self_block: "Không thể chặn dải địa chỉ chứa chính IP của bạn (admin cũng bị chặn theo).",
  invalid_cover: "Ảnh bìa phải là một ảnh trong album.",
  not_found: "Không tìm thấy — có thể đã bị xoá ở nơi khác.",
  invalid: "Dữ liệu gửi lên không hợp lệ.",
  not_creatable: "Mục này chỉ sửa được, không tạo mới.",
  not_deletable: "Mục này không xoá được từ admin (trang pháp lý, /now, album).",
  already_exists: "Đã có mục với đường dẫn (slug) này — đổi slug khác.",
  in_use: "Ảnh đang được dùng trong nội dung — gỡ khỏi bài trước khi xoá.",
  too_large: "Dữ liệu quá lớn.",
};

/** Human-readable message for an API failure. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = typeof error.data.error === "string" ? error.data.error : "";
    if (code in CODE_MESSAGES) return CODE_MESSAGES[code];
    if (code === "invalid_fields") {
      const fields = (error.data.fields as { field: string }[] | undefined) ?? [];
      return `Trường chưa hợp lệ: ${fields.map((f) => f.field).join(", ")}`;
    }
    if (code === "github_permission") {
      const needs = error.data.needs ? ` (GitHub cần: ${String(error.data.needs)})` : "";
      return `Token GitHub thiếu quyền${needs}. Lưu bài cần GITHUB_CONTENT_TOKEN có Contents: Read and write trên poli0981/content; Xuất bản cần GITHUB_PUBLISH_TOKEN có Actions: Read and write trên poli0981/poli0981-dev.`;
    }
    if (error.status === 409)
      return "Xung đột: nội dung đã thay đổi ở nơi khác (hoặc ảnh đang được dùng).";
    if (error.status === 413) return "Tệp quá lớn (tối đa 20 MB).";
    if (error.status === 415) return "Định dạng ảnh không được hỗ trợ.";
    if (error.status === 429) return "Thao tác quá nhanh — đợi một phút.";
    if (error.status === 503) return "Admin chưa được cấu hình (thiếu token).";
    return `Lỗi ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

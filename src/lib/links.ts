import type { Locale } from "../i18n/routing";

export interface SocialLink {
  name: string;
  href: string;
  desc: Record<Locale, string>;
  /** rel="me" for identity verification (Mastodon). */
  me?: boolean;
}

/**
 * Social + community links. Only GitHub + contact email are confirmed; the rest are
 * placeholders (`#`) to be filled with real URLs at launch (docs 15 P4).
 */
export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "YouTube — SkullMute",
    href: "#",
    desc: {
      vi: "Kênh chính: game, visual novel, indie/psychological horror.",
      en: "Main channel: games, visual novels, indie/psychological horror.",
    },
  },
  {
    name: "GitHub — poli0981",
    href: "https://github.com/poli0981",
    desc: { vi: "Mã nguồn & dự án mở.", en: "Source code & open projects." },
  },
  {
    name: "Discord — Gaming",
    href: "#",
    desc: {
      vi: "Cộng đồng xem stream & chơi cùng.",
      en: "Community for streams & co-op.",
    },
  },
  {
    name: "Discord — Repo",
    href: "#",
    desc: { vi: "Báo lỗi site & thảo luận dev.", en: "Site bug reports & dev talk." },
  },
  {
    name: "Telegram",
    href: "#",
    desc: { vi: "Cập nhật ngắn.", en: "Short updates." },
  },
  {
    name: "Bluesky",
    href: "#",
    desc: { vi: "Bài viết ngắn.", en: "Short posts." },
  },
  {
    name: "Mastodon",
    href: "#",
    me: true,
    desc: { vi: "Fediverse (đã xác minh).", en: "Fediverse (verified)." },
  },
  {
    name: "X",
    href: "#",
    desc: { vi: "Cập nhật ngắn.", en: "Short updates." },
  },
  {
    name: "Facebook Page",
    href: "#",
    desc: { vi: "Trang chính thức.", en: "Official page." },
  },
  {
    name: "contact@poli0981.dev",
    href: "mailto:contact@poli0981.dev",
    desc: { vi: "Liên hệ công việc.", en: "Business enquiries." },
  },
];

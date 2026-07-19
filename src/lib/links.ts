import type { Locale } from "../i18n/routing";

/** RepoLens — an external listing of all the owner's public repositories. */
export const ALL_REPOS_URL = "https://repolens.k30021424.workers.dev/repos";

/** The two public "faces" of the site (see /about): the SkullMute channel vs the dev. */
export type Persona = "game" | "dev";

export interface SocialLink {
  name: string;
  href: string;
  /** Which face this account belongs to — drives grouping on /links + /gaming vs /dev. */
  persona: Persona;
  /** Platform slug for the brand glyph (see SocialIcon.astro). */
  platform: string;
  desc: Record<Locale, string>;
  /** rel="me" for identity verification (Mastodon ↔ site backlink). */
  me?: boolean;
}

/**
 * Social + community links, grouped by persona. GitHub was already confirmed; the rest
 * come from the owner's real accounts (info.txt). Note: the SkullMute channel and the
 * Kokone/dev identity keep separate accounts on most platforms, hence the `persona` split.
 * (A personal Facebook profile exists but is intentionally kept off the public list.)
 */
export const SOCIAL_LINKS: SocialLink[] = [
  // ── SkullMute — Game ──────────────────────────────────────────────
  {
    name: "YouTube — SkullMute",
    href: "https://www.youtube.com/channel/UCCpZWle6fSgQXn3gLKoCGOg",
    persona: "game",
    platform: "youtube",
    desc: {
      vi: "Kênh chính: game, visual novel, indie/psychological horror.",
      en: "Main channel: games, visual novels, indie/psychological horror.",
    },
  },
  {
    name: "Discord — Gaming",
    href: "https://discord.gg/kDM9GMu5vm",
    persona: "game",
    platform: "discord",
    desc: {
      vi: "Cộng đồng xem stream & chơi cùng.",
      en: "Community for streams & co-op.",
    },
  },
  {
    name: "X — SkullMute",
    href: "https://x.com/SkullMute0011",
    persona: "game",
    platform: "x",
    desc: { vi: "Cập nhật về game.", en: "Game updates." },
  },
  {
    name: "Instagram — SkullMute",
    href: "https://www.instagram.com/skullmute0011/",
    persona: "game",
    platform: "instagram",
    desc: { vi: "Khoảnh khắc từ kênh.", en: "Moments from the channel." },
  },
  {
    name: "Facebook — Trang",
    href: "https://www.facebook.com/skullmute0101001",
    persona: "game",
    platform: "facebook",
    desc: { vi: "Trang chính thức.", en: "Official page." },
  },
  {
    name: "Facebook — Nhóm",
    href: "https://www.facebook.com/groups/1405423897599559",
    persona: "game",
    platform: "facebook",
    desc: { vi: "Nhóm cộng đồng.", en: "Community group." },
  },
  {
    name: "Mastodon — Game",
    href: "https://mastodon.social/@skullmute1122",
    persona: "game",
    platform: "mastodon",
    desc: { vi: "Fediverse — game.", en: "Fediverse — games." },
  },
  {
    name: "Bluesky",
    href: "https://bsky.app/profile/skullmute0011.bsky.social",
    persona: "game",
    platform: "bluesky",
    desc: { vi: "Bài viết ngắn về game.", en: "Short posts on games." },
  },
  {
    name: "Steam",
    href: "https://steamcommunity.com/profiles/76561199544666292/",
    persona: "game",
    platform: "steam",
    desc: { vi: "Hồ sơ Steam.", en: "Steam profile." },
  },

  // ── Kokone — Dev / đời thường ─────────────────────────────────────
  {
    name: "GitHub — poli0981",
    href: "https://github.com/poli0981",
    persona: "dev",
    platform: "github",
    desc: { vi: "Mã nguồn & dự án mở.", en: "Source code & open projects." },
  },
  {
    name: "Discord — Repo",
    href: "https://discord.gg/QFDEqqnua",
    persona: "dev",
    platform: "discord",
    desc: { vi: "Báo lỗi site & thảo luận dev.", en: "Site bug reports & dev talk." },
  },
  {
    name: "Mastodon — Dev",
    href: "https://mastodon.social/@equal112",
    persona: "dev",
    platform: "mastodon",
    me: true,
    desc: {
      vi: "Fediverse — dev & tin tức (đã xác minh).",
      en: "Fediverse — dev & news (verified).",
    },
  },
  {
    name: "X — Kokone",
    href: "https://x.com/tech9191010985",
    persona: "dev",
    platform: "x",
    desc: { vi: "Dev, đời sống, công nghệ.", en: "Dev, life, tech." },
  },
  {
    name: "Instagram — Kokone",
    href: "https://www.instagram.com/koko.walkthrough.773/",
    persona: "dev",
    platform: "instagram",
    desc: { vi: "Đời thường & dev.", en: "Everyday life & dev." },
  },
  {
    name: "Facebook — Kokone",
    href: "https://www.facebook.com/profile.php?id=61565156379185",
    persona: "dev",
    platform: "facebook",
    desc: { vi: "Dev & đời sống thường nhật.", en: "Dev & everyday life." },
  },
];

/** Topic-scoped contact addresses (Cloudflare Email Routing is configured for all four). */
export type EmailScope = "general" | "code" | "sponsor" | "games";

export interface ContactEmail {
  address: string;
  href: string;
  scope: EmailScope;
  label: Record<Locale, string>;
}

const GENERAL_EMAIL: ContactEmail = {
  address: "contact@poli0981.dev",
  href: "mailto:contact@poli0981.dev",
  scope: "general",
  label: { vi: "Liên hệ chung", en: "General enquiries" },
};

export const CONTACT_EMAILS: ContactEmail[] = [
  GENERAL_EMAIL,
  {
    address: "code@poli0981.dev",
    href: "mailto:code@poli0981.dev",
    scope: "code",
    label: { vi: "Mã nguồn & dự án", en: "Source code & projects" },
  },
  {
    address: "sponsor@poli0981.dev",
    href: "mailto:sponsor@poli0981.dev",
    scope: "sponsor",
    label: { vi: "Quảng cáo & hợp tác", en: "Sponsorship & partnerships" },
  },
  {
    address: "games@poli0981.dev",
    href: "mailto:games@poli0981.dev",
    scope: "games",
    label: { vi: "Key/mã game, playtest", en: "Game keys & playtests" },
  },
];

/** Socials belonging to one persona (preserves declaration order). */
export function socialsForPersona(persona: Persona): SocialLink[] {
  return SOCIAL_LINKS.filter((l) => l.persona === persona);
}

/** The contact address for a topic; always defined (falls back to general). */
export function emailForScope(scope: EmailScope): ContactEmail {
  return CONTACT_EMAILS.find((e) => e.scope === scope) ?? GENERAL_EMAIL;
}

/** Deduped profile URLs for JSON-LD `Person.sameAs` (http(s) only, no mailto). */
export function sameAsUrls(): string[] {
  const urls = SOCIAL_LINKS.filter((l) => l.href.startsWith("http")).map((l) => l.href);
  return Array.from(new Set(urls));
}

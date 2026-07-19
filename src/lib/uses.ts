import type { Locale } from "../i18n/routing";

/** One row in a /dev/uses table. */
interface UsesItem {
  label: Record<Locale, string>;
  value: string;
  /** Optional short qualifier shown muted after the value. */
  note?: Record<Locale, string>;
}

interface UsesGroup {
  title: Record<Locale, string>;
  items: UsesItem[];
}

/** The owner's real setup (spec.txt). Kept as structured data so both locales share it. */
export const USES: UsesGroup[] = [
  {
    title: { vi: "Phần cứng", en: "Hardware" },
    items: [
      { label: { vi: "CPU", en: "CPU" }, value: "Intel Core i7-14700KF" },
      { label: { vi: "GPU", en: "GPU" }, value: "NVIDIA GeForce RTX 5080" },
      { label: { vi: "RAM", en: "RAM" }, value: "32 GB DDR5" },
      {
        label: { vi: "Bo mạch chủ", en: "Motherboard" },
        value: "Gigabyte Z790M AORUS ELITE AX",
      },
      {
        label: { vi: "Màn hình", en: "Monitor" },
        value: "MSI MAG 274QF X24",
        note: { vi: "27 inch · 2K · 240 Hz", en: "27-inch · 2K · 240 Hz" },
      },
      {
        label: { vi: "Lưu trữ", en: "Storage" },
        value: "KIOXIA EXCERIA PLUS Portable SSD 2TB",
        note: { vi: "ổ ngoài", en: "external drive" },
      },
      { label: { vi: "Tay cầm", en: "Controller" }, value: "Xbox Series X Controller" },
      { label: { vi: "Hệ điều hành", en: "OS" }, value: "Windows 11 Pro" },
    ],
  },
  {
    title: { vi: "Phần mềm", en: "Software" },
    items: [
      { label: { vi: "Dựng phim", en: "Video editor" }, value: "DaVinci Resolve Studio 21.x" },
      { label: { vi: "IDE", en: "IDE" }, value: "JetBrains IDEs, VS Code" },
    ],
  },
];

/** Languages & frameworks currently in rotation (spec.txt). */
export const USES_STACK: string[] = [
  "C#",
  "JavaScript",
  "TypeScript",
  "Svelte",
  "React",
  "Astro",
  "Python",
];

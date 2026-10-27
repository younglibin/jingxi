import type { PublicSite } from "./types";
export const defaultSite: PublicSite = {
  siteVersion: 0,
  brand: { name: "未命名工作室", tagline: "作品与内容由你定义。" },
  about: { description: "", teamImages: [] },
  contact: { email: "", address: "", links: [] },
  categories: [],
  homepage: {
    hero: {
      enabled: true,
      title: "为你的作品，\n留一个好位置。",
      description: "作品展示 · 品牌文案占位",
      works: [],
    },
    featured: {
      enabled: true,
      title: "让好作品，\n被看见。",
      description: "",
      works: [],
    },
    banner: {
      enabled: true,
      desktopFocal: { x: 0.5, y: 0.5 },
      mobileFocal: { x: 0.5, y: 0.5 },
      logos: [],
    },
    statement: { enabled: true, text: "", works: [] },
    categories: { enabled: true, items: [] },
    gallery: { enabled: true, works: [] },
    cases: { enabled: true, items: [] },
    capabilities: { enabled: true, items: [] },
    closing: {
      enabled: true,
      title: "下一个好作品，\n一起创造。",
      showDecoration: true,
      iconKeys: [],
    },
  },
};

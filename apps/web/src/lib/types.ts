import type { Content } from "./editor";
export type Image = {
  url: string;
  width: number;
  height: number;
  alt?: string;
  crop?: { x: number; y: number; width: number; height: number };
  focal?: { x: number; y: number };
};
export type Card = {
  publicKey: string;
  slug: string;
  title: string;
  summary: string;
  year: number | null;
  category: { slug: string; name: string };
  cover: Image;
};
export type Detail = Card & {
  client?: string;
  role?: string;
  blocks: {
    id: string;
    type: "image" | "text";
    sortOrder: number;
    text?: string;
    image?: Image;
    alt?: string;
    caption?: string;
  }[];
  relatedWorks: Card[];
};
export type Category = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  system: boolean;
  sortOrder: number;
  revision: number;
  draftReferenceCount: number;
  publishedReferenceCount: number;
  siteReferenceCount: number;
};
export type Work = {
  id: string;
  publicKey: string;
  lockedSlug: string | null;
  draftRevision: number;
  stateRevision: number;
  draft: { content: Content };
  published: null | {
    version: number;
    sourceDraftRevision: number;
    publishedAt: string;
    content: Content;
  };
  visible: boolean;
  sortOrder: number | null;
  recycledAt: string | null;
  lastPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Asset = {
  id: string;
  width: number;
  height: number;
  originalName: string;
  previewUrl: string;
  displayImages: { url: string; size: number }[];
};
export type PublicSite = {
  loadError?: string;
  siteVersion: number;
  brand: { name: string; tagline: string; logoUrl?: string };
  about: {
    description: string;
    mainImage?: Image;
    teamImages: { image?: Image; url?: string; caption?: string }[];
  };
  contact: {
    email: string;
    address: string;
    links: { label: string; url: string }[];
  };
  homepage: {
    hero: {
      enabled: boolean;
      title: string;
      description: string;
      works: Card[];
    };
    featured: {
      enabled: boolean;
      title: string;
      description: string;
      works: Card[];
    };
    banner: {
      enabled: boolean;
      image?: Image;
      desktopFocal: { x: number; y: number };
      mobileFocal: { x: number; y: number };
      logos: { image?: Image; url?: string }[];
      linkedWorkSlug?: string;
    };
    statement: { enabled: boolean; text: string; works: Card[] };
    categories: {
      enabled: boolean;
      items: { slug: string; name: string; works: Card[] }[];
    };
    gallery: { enabled: boolean; works: Card[] };
    cases: {
      enabled: boolean;
      items: { work: Card; summaryOverride: string }[];
    };
    capabilities: {
      enabled: boolean;
      items: { title: string; description: string }[];
    };
    closing: {
      enabled: boolean;
      title: string;
      showDecoration: boolean;
      iconKeys: string[];
    };
  };
  categories: { slug: string; name: string }[];
};
export type Browse = {
  items: Card[];
  total: number;
  categoryCounts: Record<string, number>;
  hasMore: boolean;
};

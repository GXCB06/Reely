import { describe, expect, it } from "vitest";
import { type ExportData, toCsv, toMarkdown } from "./export";

const data: ExportData = {
  title: "AccOS Pro",
  brief: "AI accounting for Thai SMEs",
  product: { name: "AccOS Pro", whatItIs: "AI accounting", audience: "Thai SME owners", competitors: ["PEAK"] },
  goal: "startup",
  keywords: ["ทำบัญชีเอง", "accounting app"],
  platforms: ["tiktok"],
  region: "th",
  settings: { days: 90, minViews: 10_000 },
  createdAt: "2026-10-27T05:00:00.000Z",
  summary: { headline: "Pain skits win", takeaway: "@a got 1.2M views." },
  formulas: [{ name: "Pain then fix", why: "Relatable", hook: "Still doing ___ by hand?", idea: "Show the month-end pile", examples: ["@a"] }],
  clips: [
    {
      rank: 1, platform: "tiktok", handle: "a", url: "https://www.tiktok.com/@a/video/1", caption: 'ปิดงบ "สิ้นเดือน", อีกแล้ว\nline 2',
      views: 1_200_000, usualViews: 40_000, multiplier: 30, multiplierOf: "usual", label: "breakout", likes: 90_000, comments: 1_200, saves: 5_000, shares: 3_000,
      engagement: 0.0827, followers: 50_000, postedAt: "2026-10-01T00:00:00Z", durationSeconds: 32, keyword: "ทำบัญชีเอง",
      spokenHook: "ใครยังปิดงบเองอยู่บ้าง", idea: null, similarProduct: false,
    },
  ],
};

describe("toCsv", () => {
  it("starts with a BOM for Excel and quotes commas, quotes and new lines", () => {
    const csv = toCsv(data);
    expect(csv.startsWith("﻿")).toBe(true);
    const [head, row] = csv.slice(1).split("\r\n");
    expect(head.split(",")[0]).toBe("rank");
    expect(row).toContain('"ปิดงบ ""สิ้นเดือน"", อีกแล้ว\nline 2"');
    expect(row).toContain(",8.3,");
    expect(row).toContain(",30.0,usual,breakout,");
  });
});

describe("toMarkdown", () => {
  it("gives an AI the product, the clips' real numbers and a starter prompt", () => {
    const md = toMarkdown(data, "en");
    expect(md).toContain("# Reely research data: AccOS Pro");
    expect(md).toContain("### 1. @a · tiktok");
    expect(md).toContain("1.2M views · 30.0× usual (40.0K) · breakout · engagement 8.3%");
    expect(md).toContain("Spoken opening line: ใครยังปิดงบเองอยู่บ้าง");
    expect(md).toContain("Don't invent numbers");
  });
});

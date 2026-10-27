// Research export: the same data the results page shows, as CSV (Excel), Markdown (for Claude / ChatGPT) or JSON.
// Pure formatting, tested directly; lib/export-data.ts loads the data.

export type ExportClip = {
  rank: number;
  platform: string;
  handle: string;
  url: string;
  caption: string;
  views: number | null;
  usualViews: number | null;
  multiplier: number | null;
  /** What the multiplier compares with: the creator's usual views, or (when unknown) their follower count. */
  multiplierOf: "usual" | "followers" | null;
  label: string;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  /** Likes + comments + saves + shares per view (0-1). */
  engagement: number | null;
  followers: number | null;
  postedAt: string | null;
  durationSeconds: number | null;
  keyword: string;
  /** The opening line as spoken (when anyone read the clip's transcript). */
  spokenHook: string | null;
  /** Reely's "your idea" line for this clip. */
  idea: string | null;
  /** In "From similar products": an app or brand like the user's, promoting itself. */
  similarProduct: boolean;
};

export type ExportData = {
  title: string;
  brief: string;
  product: { name: string; whatItIs: string; audience: string; competitors: string[] } | null;
  goal: string | null;
  keywords: string[];
  platforms: string[];
  region: string;
  settings: { days?: number; minViews?: number };
  createdAt: string;
  summary: { headline: string; takeaway: string } | null;
  formulas: { name: string; why: string; hook: string; idea: string; examples: string[] }[];
  clips: ExportClip[];
};

const pct = (x: number | null) => (x === null ? "" : (x * 100).toFixed(1));
const num = (x: number | null) => (x === null ? "" : String(x));

/** CSV with a UTF-8 BOM, so Excel shows Thai correctly. */
export function toCsv(d: ExportData): string {
  const head = [
    "rank", "platform", "handle", "url", "views", "usual_views", "multiplier", "multiplier_of", "label", "likes", "comments", "saves", "shares",
    "engagement_pct", "followers", "posted_at", "duration_s", "keyword", "similar_product", "caption", "spoken_hook", "idea",
  ];
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = d.clips.map((c) =>
    [
      String(c.rank), c.platform, c.handle, c.url, num(c.views), num(c.usualViews), c.multiplier === null ? "" : c.multiplier.toFixed(1),
      c.multiplierOf ?? "", c.label, num(c.likes), num(c.comments), num(c.saves), num(c.shares), pct(c.engagement), num(c.followers), c.postedAt?.slice(0, 10) ?? "",
      num(c.durationSeconds), c.keyword, c.similarProduct ? "yes" : "", c.caption, c.spokenHook ?? "", c.idea ?? "",
    ].map(cell).join(","),
  );
  return "﻿" + [head.join(","), ...rows].join("\r\n") + "\r\n";
}

export function toJson(d: ExportData): string {
  return JSON.stringify({ source: "Reely", ...d }, null, 2);
}

const compact = (n: number | null) =>
  n === null ? "?" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

/**
 * Markdown for an AI assistant: context first (product, goal, what was searched), then the clips with their real
 * numbers, then a starter prompt, so scripts come from data rather than guesses.
 */
export function toMarkdown(d: ExportData, lang: "th" | "en"): string {
  const th = lang === "th";
  const L = (thText: string, enText: string) => (th ? thText : enText);
  const out: string[] = [];
  out.push(`# ${L("ข้อมูลรีเสิร์ชจาก Reely", "Reely research data")}: ${d.title}`, "");
  if (d.product) {
    out.push(`## ${L("สินค้า", "Product")}`);
    out.push(`- ${L("ชื่อ", "Name")}: ${d.product.name}`);
    if (d.product.whatItIs) out.push(`- ${L("ทำอะไร", "What it does")}: ${d.product.whatItIs}`);
    if (d.product.audience) out.push(`- ${L("กลุ่มเป้าหมาย", "Audience")}: ${d.product.audience}`);
    if (d.product.competitors.length) out.push(`- ${L("คู่แข่ง", "Competitors")}: ${d.product.competitors.join(", ")}`);
    if (d.goal) out.push(`- ${L("ใช้คลิปเพื่อ", "Goal")}: ${d.goal}`);
    out.push("");
  }
  out.push(`## ${L("สิ่งที่ค้น", "What was searched")}`);
  out.push(`- ${L("โจทย์", "Brief")}: ${d.brief}`);
  out.push(`- ${L("คีย์เวิร์ด", "Keywords")}: ${d.keywords.join(", ")}`);
  out.push(`- ${L("แพลตฟอร์ม", "Platforms")}: ${d.platforms.join(", ")} · ${L("ภูมิภาค", "Region")}: ${d.region}`);
  out.push(
    `- ${L("ช่วงเวลา", "Window")}: ${d.settings.days ?? 90} ${L("วัน", "days")} · ${L("วิวขั้นต่ำ", "Min views")}: ${compact(d.settings.minViews ?? null)} · ${L("วันที่รีเสิร์ช", "Researched")}: ${d.createdAt.slice(0, 10)}`,
  );
  out.push(
    `- ${L("ตัวคูณ = วิวของคลิปนี้ ÷ วิวปกติของครีเอเตอร์ (ค่ากลางของโพสต์ล่าสุด)", "Multiplier = this clip's views ÷ the creator's usual views (median of recent posts)")}`,
    "",
  );
  if (d.summary) {
    out.push(`## ${L("สรุป", "Summary")}`, `**${d.summary.headline}**`, "", d.summary.takeaway, "");
  }
  if (d.formulas.length) {
    out.push(`## ${L("สูตรที่คลิปปังใช้ซ้ำ", "Formulas the winners repeat")}`);
    d.formulas.forEach((f, i) => {
      out.push(`### ${i + 1}. ${f.name}`, `- ${L("ทำไมได้ผล", "Why it works")}: ${f.why}`, `- ${L("ฮุก", "Hook")}: ${f.hook}`, `- ${L("ไอเดีย", "Idea")}: ${f.idea}`);
      if (f.examples.length) out.push(`- ${L("ตัวอย่าง", "Examples")}: ${f.examples.join(", ")}`);
    });
    out.push("");
  }
  out.push(`## ${L("คลิป (เรียงจากดีที่สุด)", "Clips (best first)")}`);
  for (const c of d.clips) {
    const stats = [
      `${compact(c.views)} ${L("วิว", "views")}`,
      c.multiplier === null
        ? null
        : c.multiplierOf === "usual"
          ? `${c.multiplier.toFixed(1)}× ${L("ของวิวปกติ", "usual")} (${compact(c.usualViews)})`
          : `${c.multiplier.toFixed(1)}× ${L("ของผู้ติดตาม", "followers")} (${compact(c.followers)})`,
      c.label !== "normal" ? c.label : null,
      c.engagement !== null ? `${L("เอนเกจ", "engagement")} ${pct(c.engagement)}%` : null,
    ].filter(Boolean);
    out.push(`### ${c.rank}. @${c.handle} · ${c.platform}${c.similarProduct ? ` · ${L("สินค้าคล้ายกัน", "similar product")}` : ""}`);
    out.push(`- ${stats.join(" · ")}`);
    const counts = [
      c.likes !== null ? `${L("ไลก์", "likes")} ${compact(c.likes)}` : null,
      c.comments !== null ? `${L("คอมเมนต์", "comments")} ${compact(c.comments)}` : null,
      c.saves !== null ? `${L("เซฟ", "saves")} ${compact(c.saves)}` : null,
      c.shares !== null ? `${L("แชร์", "shares")} ${compact(c.shares)}` : null,
      c.followers !== null ? `${L("ผู้ติดตาม", "followers")} ${compact(c.followers)}` : null,
      c.durationSeconds !== null ? `${c.durationSeconds}s` : null,
      c.postedAt ? c.postedAt.slice(0, 10) : null,
    ].filter(Boolean);
    if (counts.length) out.push(`- ${counts.join(" · ")}`);
    out.push(`- ${L("แคปชัน", "Caption")}: ${c.caption.replace(/\s+/g, " ").trim() || "—"}`);
    if (c.spokenHook) out.push(`- ${L("ประโยคเปิดที่พูดจริง", "Spoken opening line")}: ${c.spokenHook}`);
    if (c.idea) out.push(`- ${L("ไอเดียจาก Reely", "Reely's idea")}: ${c.idea}`);
    out.push(`- ${c.url}`);
  }
  out.push("");
  out.push(`## ${L("วิธีใช้กับ AI", "Using this with an AI")}`);
  out.push(
    L(
      `วางข้อมูลนี้ทั้งหมดใน Claude หรือ ChatGPT แล้วพิมพ์เช่น: "จากข้อมูลคลิปจริงด้านบนเท่านั้น เขียนสคริปต์คลิปสั้น 3 ตัวสำหรับ ${d.product?.name ?? "สินค้าของฉัน"} แต่ละตัวยืมโครงสร้างจากคลิปที่ตัวคูณและเอนเกจสูง บอกว่ายืมจากคลิปไหน (@ชื่อ) ใส่ฮุก 3 วินาทีแรก ช็อตที่ต้องถ่าย และคำชวนท้ายคลิป ห้ามแต่งตัวเลขที่ไม่มีในข้อมูล"`,
      `Paste all of this into Claude or ChatGPT, then ask for example: "Using only the real clip data above, write 3 short-video scripts for ${d.product?.name ?? "my product"}. Each borrows the structure of a clip with a high multiplier and engagement; say which clip (@handle) it borrows from, and give the 3-second hook, the shots to film and the call to action. Don't invent numbers that aren't in the data."`,
    ),
  );
  return out.join("\n") + "\n";
}

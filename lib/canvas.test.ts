import { describe, expect, it } from "vitest";
import { contentText, formatsFor, MAX_CLIPS, parseInputs } from "./canvas";

describe("parseInputs", () => {
  it("keeps valid clip ids once, up to the limit, and trims the note and link", () => {
    const clips = [3, 3, -1, 2.5, "7", ...Array.from({ length: 10 }, (_, i) => i + 10)];
    const parsed = parseInputs({ clips, note: "x".repeat(900), link: "  https://a.co  " });
    expect(parsed.clips).toHaveLength(MAX_CLIPS);
    expect(parsed.clips[0]).toBe(3);
    expect(parsed.note).toHaveLength(500);
    expect(parsed.link).toBe("https://a.co");
  });

  it("never throws on an odd row", () => {
    expect(parseInputs(null)).toEqual({ clips: [], note: "", link: null });
    expect(parseInputs({ clips: "no", link: "" })).toEqual({ clips: [], note: "", link: null });
  });
});

describe("formatsFor", () => {
  it("puts the goal's own format first and keeps every format once", () => {
    expect(formatsFor("startup")[0]).toBe("demo");
    expect(formatsFor("sell")[0]).toBe("shopReview");
    expect(formatsFor(null)[0]).toBe("script");
    expect(new Set(formatsFor("startup")).size).toBe(6);
  });
});

describe("contentText", () => {
  it("writes a script as timed lines with its caption and hashtags", () => {
    const text = contentText({
      format: "demo",
      title: "Close the month in 10 minutes",
      durationSeconds: 30,
      beats: [
        { label: "pain", time: "0:00", voiceover: "Still typing receipts?", onScreen: "", visual: "Desk full of receipts", from: "@a" },
        { label: "feature", time: "0:04", voiceover: "Snap it.", onScreen: "Scan", visual: "Phone scans a receipt", from: "" },
        { label: "cta", time: "0:20", voiceover: "Try it free.", onScreen: "", visual: "", from: "" },
      ],
      caption: "Receipts, done.",
      hashtags: ["บัญชี", "#SME"],
      borrowed: "",
    });
    expect(text).toContain("[0:00] pain: Still typing receipts?");
    expect(text).toContain("(Phone scans a receipt)");
    expect(text).toContain("#บัญชี #SME");
  });

  it("numbers hooks and caption options", () => {
    expect(contentText({ format: "hooks", hooks: [1, 2, 3].map((n) => ({ line: `Hook ${n}`, onScreen: "", why: "", from: "" })) })).toBe(
      "1. Hook 1\n2. Hook 2\n3. Hook 3",
    );
    expect(contentText({ format: "caption", options: [1, 2, 3].map((n) => ({ caption: `C${n}`, hashtags: [] })) })).toContain("2. C2");
  });
});

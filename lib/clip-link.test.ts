import { describe, expect, it } from "vitest";
import { parseClipLink } from "./clip-link";

describe("parseClipLink", () => {
  it("reads Instagram reel, post and profile-style links", () => {
    expect(parseClipLink("https://www.instagram.com/reel/DUGJmvFEbnZ/?igsh=abc")).toEqual({
      platform: "instagram",
      id: "DUGJmvFEbnZ",
      url: "https://www.instagram.com/reel/DUGJmvFEbnZ/",
    });
    expect(parseClipLink("look instagram.com/p/C0_5FfRrYhB nice")?.id).toBe("C0_5FfRrYhB");
    expect(parseClipLink("https://instagram.com/nipt.academy/reel/DerYFCgRqyd/")?.id).toBe("DerYFCgRqyd");
  });

  it("reads TikTok video and share links", () => {
    expect(parseClipLink("https://www.tiktok.com/@peakaccount/video/7412345678901234567?lang=th")).toEqual({
      platform: "tiktok",
      id: "7412345678901234567",
      url: "https://www.tiktok.com/@peakaccount/video/7412345678901234567",
    });
    expect(parseClipLink("https://vt.tiktok.com/ZSabc123/")).toEqual({ platform: "tiktok", id: null, url: "https://vt.tiktok.com/ZSabc123/" });
  });

  it("ignores product links and profiles", () => {
    expect(parseClipLink("https://accospro.app")).toBeNull();
    expect(parseClipLink("https://www.instagram.com/nipt.academy/")).toBeNull();
    expect(parseClipLink("https://www.tiktok.com/@peakaccount")).toBeNull();
  });
});

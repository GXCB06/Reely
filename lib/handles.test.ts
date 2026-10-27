import { describe, expect, it } from "vitest";
import { parseHandle } from "./handles";

describe("parseHandle", () => {
  it("accepts bare and @ handles without a platform", () => {
    expect(parseHandle("@flowaccountchannel")).toEqual({ platform: null, handle: "flowaccountchannel" });
    expect(parseHandle("  peakaccount ")).toEqual({ platform: null, handle: "peakaccount" });
  });

  it("reads TikTok profile and video URLs", () => {
    expect(parseHandle("https://www.tiktok.com/@flowaccountchannel")).toEqual({ platform: "tiktok", handle: "flowaccountchannel" });
    expect(parseHandle("https://www.tiktok.com/@peakaccount/video/7687604521563933973?lang=th")).toEqual({
      platform: "tiktok",
      handle: "peakaccount",
    });
    expect(parseHandle("tiktok.com/@accospro.app")).toEqual({ platform: "tiktok", handle: "accospro.app" });
  });

  it("reads YouTube handle and channel URLs", () => {
    expect(parseHandle("https://www.youtube.com/@FlowAccountChannel/shorts")).toEqual({ platform: "youtube", handle: "FlowAccountChannel" });
    expect(parseHandle("https://youtube.com/channel/UCPQ_g-oZBwyLPKk_1IWAWOg")).toEqual({
      platform: "youtube",
      handle: "UCPQ_g-oZBwyLPKk_1IWAWOg",
    });
  });

  it("reads Instagram profile URLs, not reel links", () => {
    expect(parseHandle("https://www.instagram.com/liftoff_app/")).toEqual({ platform: "instagram", handle: "liftoff_app" });
    expect(parseHandle("instagram.com/lyfta.app?igsh=abc")).toEqual({ platform: "instagram", handle: "lyfta.app" });
    expect(parseHandle("https://www.instagram.com/reel/DUGJmvFEbnZ/")).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseHandle("")).toBeNull();
    expect(parseHandle("https://example.com/@someone")).toBeNull();
    expect(parseHandle("hello world")).toBeNull();
    expect(parseHandle("https://www.tiktok.com/foryou")).toBeNull();
  });
});

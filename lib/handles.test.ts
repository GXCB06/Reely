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

  it("rejects junk", () => {
    expect(parseHandle("")).toBeNull();
    expect(parseHandle("https://example.com/@someone")).toBeNull();
    expect(parseHandle("hello world")).toBeNull();
    expect(parseHandle("https://www.tiktok.com/foryou")).toBeNull();
  });
});

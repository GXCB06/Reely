import { describe, expect, it } from "vitest";
import { embedUrl } from "./embed";

describe("embedUrl", () => {
  it("plays TikTok clips with TikTok's player, muted and bare for previews", () => {
    expect(embedUrl("tiktok", "7412345678901234567")).toMatch(/^https:\/\/www\.tiktok\.com\/player\/v1\/7412345678901234567\?autoplay=1/);
    expect(embedUrl("tiktok", "7412345678901234567")).not.toContain("muted=1");
    expect(embedUrl("tiktok", "7412345678901234567", true)).toContain("muted=1&controls=0");
    expect(embedUrl("tiktok", "not-an-id")).toBeNull();
  });

  it("plays YouTube Shorts without cookies, looping", () => {
    expect(embedUrl("youtube", "VIcGMx_ILOE")).toBe(
      "https://www.youtube-nocookie.com/embed/VIcGMx_ILOE?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=VIcGMx_ILOE",
    );
    expect(embedUrl("youtube", "VIcGMx_ILOE", true)).toContain("&mute=1&controls=0");
  });

  it("embeds Instagram reels, but never as a hover preview", () => {
    expect(embedUrl("instagram", "DUGJmvFEbnZ")).toBe("https://www.instagram.com/reel/DUGJmvFEbnZ/embed/");
    expect(embedUrl("instagram", "DUGJmvFEbnZ", true)).toBeNull();
  });
});

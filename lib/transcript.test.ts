import { describe, expect, it } from "vitest";
import { clock, firstSeconds, mergeSegments, parseVtt, speechStats } from "./transcript";

describe("parseVtt", () => {
  it("reads cues with times and joins multi-line text", () => {
    const vtt = "WEBVTT\n\n\n00:00:00.080 --> 00:00:02.000\nสวัสดีครับ\nวันนี้\n\n00:01:02.500 --> 00:01:04,000\nbye";
    expect(parseVtt(vtt)).toEqual([
      { start: 0.08, end: 2, text: "สวัสดีครับ วันนี้" },
      { start: 62.5, end: 64, text: "bye" },
    ]);
  });
});

describe("mergeSegments", () => {
  it("joins word pieces into lines, breaking at pauses and at the length limit", () => {
    const words = [
      { start: 0.4, end: 0.7, text: "new" },
      { start: 0.8, end: 1.0, text: "store" },
      { start: 2.5, end: 2.8, text: "open" },
    ];
    expect(mergeSegments(words)).toEqual([
      { start: 0.4, end: 1.0, text: "new store" },
      { start: 2.5, end: 2.8, text: "open" },
    ]);
  });
  it("joins Thai pieces without a space", () => {
    expect(mergeSegments([{ start: 0, end: 0.3, text: "ร้าน" }, { start: 0.3, end: 0.6, text: "ใหม่" }])[0].text).toBe("ร้านใหม่");
  });
});

describe("firstSeconds", () => {
  it("keeps whole segments inside the window and a time-share of the one that runs past it", () => {
    const segs = [
      { start: 0, end: 1, text: "Stop scrolling." },
      { start: 1, end: 5, text: "Here is how I save two hours a day" },
    ];
    // 2 of the second segment's 4 seconds = half its text, without the half-cut word.
    expect(firstSeconds(segs, 3)).toBe("Stop scrolling. Here is how I…");
  });
  it("estimates the opening of one long Thai cue", () => {
    expect(firstSeconds([{ start: 0, end: 10, text: "กขคงจฉชซฌญฎฏฐฑฒณดตถท" }], 3)).toBe("กขคงจฉ…");
  });
});

describe("speechStats", () => {
  it("says when speech starts and how much of the clip is talk", () => {
    expect(speechStats([{ start: 0.5, end: 4.5, text: "a" }, { start: 6, end: 8, text: "b" }], 10)).toEqual({
      startsAt: 0.5,
      talkShare: 0.6,
      duration: 10,
    });
    expect(speechStats([])).toBeNull();
  });
});

it("clock", () => {
  expect(clock(75.4)).toBe("1:15");
  expect(clock(3)).toBe("0:03");
});

import { describe, expect, it } from "vitest";
import { type AskAnswer, type AskClip, clipTotals, threadMemory } from "./ask";

const clip = (handle: string, views: number | null, multiplier: number | null, dbId = 1): AskClip => ({
  dbId,
  handle,
  platform: "tiktok",
  thumbnailUrl: null,
  views,
  multiplier,
});
const answer = (a: Partial<AskAnswer>): AskAnswer => ({
  kind: "answer",
  reply: "",
  reference: null,
  clips: [],
  hooks: [],
  script: null,
  researchHref: null,
  ...a,
});

describe("clipTotals", () => {
  it("adds up views and counts clips at 5x or more", () => {
    expect(clipTotals([clip("a", 1_000_000, 12), clip("b", 50_000, 4.9), clip("c", null, null)])).toEqual({ views: 1_050_000, standout: 1 });
  });
});

describe("threadMemory", () => {
  it("keeps numbered hooks so 'hook 2' can be resolved", () => {
    const memory = threadMemory([
      {
        question: "ขอ 3 ฮุกที่ดีที่สุด",
        answer: answer({
          kind: "hooks",
          hooks: [
            { clip: clip("a", 1, 1), hook: "ใครยังปิดงบเองอยู่บ้าง", hookType: "คำถาม", format: "talking head" },
            { clip: clip("b", 1, 1), hook: "3 แอปที่ช่วยให้รวย", hookType: "ลิสต์", format: "สอน" },
          ],
        }),
      },
    ]);
    expect(memory).toEqual(["Q1: ขอ 3 ฮุกที่ดีที่สุด", 'A1 (hooks): 1=@a "ใครยังปิดงบเองอยู่บ้าง", 2=@b "3 แอปที่ช่วยให้รวย"']);
  });

  it("keeps only the last turns and shortens long text", () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: answer({ reply: "x".repeat(300) }) }));
    const memory = threadMemory(turns);
    expect(memory).toHaveLength(8);
    expect(memory[0]).toBe("Q1: q2");
    expect(memory[1].length).toBeLessThan(220);
  });

  it("names the clip a script was built from", () => {
    const script = { id: "s", clip: clip("c", 1, 1), title: "ฉันรีแบรนด์โซดา", durationSeconds: 30, beats: [], hookType: null, format: null };
    expect(threadMemory([{ question: "เขียนสคริปต์", answer: answer({ kind: "script", script }) }])[1]).toBe('A1 (script): script from @c: "ฉันรีแบรนด์โซดา"');
  });
});

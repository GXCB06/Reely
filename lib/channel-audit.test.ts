import { describe, expect, it } from "vitest";
import { resolveAudit } from "./channel-audit";

const idea = (basedOn: string[]) => ({ title: "t", hook: "h", angle: "a", why: "w", basedOn });

describe("resolveAudit", () => {
  it("maps P / C labels to video ids, drops made-up labels and points left without a source", () => {
    const audit = resolveAudit(
      {
        summary: "s",
        commonInHits: [
          { point: "comment-to-get hooks", posts: ["P1", "p2", "P9"] },
          { point: "made up", posts: ["P42"] },
        ],
        weakPattern: [{ point: "long captions", posts: ["P3"] }],
        gaps: [{ point: "demos", clips: ["C1", "X1"] }],
        ideas: [idea(["P1", "C2"]), idea([]), idea(["C9"]), idea(["P2"]), idea(["P1", "P1"])],
      },
      [101, 102, 103],
      [201, 202],
    );
    expect(audit.commonInHits).toEqual([{ point: "comment-to-get hooks", videoIds: [101, 102] }]);
    expect(audit.weakPattern[0].videoIds).toEqual([103]);
    expect(audit.gaps).toEqual([{ point: "demos", videoIds: [201] }]);
    expect(audit.ideas.map((i) => i.videoIds)).toEqual([[101, 202], [], [], [102], [101]]);
    expect(audit.postsRead).toBe(3);
    expect(audit.clipsRead).toBe(2);
  });
});

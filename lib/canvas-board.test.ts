import { describe, expect, it } from "vitest";
import { layout, MAIN_NODE, nodeClips, outputNode, parseBoard } from "./canvas-board";

describe("parseBoard", () => {
  it("always has a main node, keeps valid nodes once and drops broken parts", () => {
    const b = parseBoard(
      {
        positions: { product: { x: 10.4, y: 20 }, bad: { x: "1", y: 2 } },
        formats: [
          { id: "f1", format: "hooks", instructions: "x".repeat(400), clips: [3, 3, -1, 2.5, 7] },
          { id: "f1", format: "brief", clips: [] },
          { id: "f2", format: "nope" },
        ],
        outputs: { o1: "f1", o2: "gone", o3: 5 },
      },
      "demo",
    );
    expect(b.formats.map((f) => f.id)).toEqual([MAIN_NODE, "f1"]);
    expect(b.formats[0]).toEqual({ id: MAIN_NODE, format: "demo", instructions: "", clips: null });
    expect(b.formats[1].clips).toEqual([3, 7]);
    expect(b.formats[1].instructions).toHaveLength(300);
    expect(b.positions).toEqual({ product: { x: 10, y: 20 } });
    expect(b.outputs).toEqual({ o1: "f1" });
  });

  it("never throws on an empty or odd value", () => {
    expect(parseBoard(null, "script").formats).toHaveLength(1);
    expect(parseBoard("x", "script").outputs).toEqual({});
  });
});

describe("nodeClips and outputNode", () => {
  const b = parseBoard({ formats: [{ id: "f1", format: "hooks", clips: [1, 9] }], outputs: { o1: "f1" } }, "script");

  it("limits a node to clips still on the canvas; the main node uses them all", () => {
    expect(nodeClips(b.formats[1], [1, 2, 3])).toEqual([1]);
    expect(nodeClips(b.formats[0], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("puts outputs made in the Steps view under the main node", () => {
    expect(outputNode(b, "o1")).toBe("f1");
    expect(outputNode(b, "o9")).toBe(MAIN_NODE);
  });
});

describe("layout", () => {
  it("lays inputs out on the left, formats in the middle, outputs on the right, keeping saved positions", () => {
    const b = parseBoard({ positions: { "clip-2": { x: 5, y: 5 } }, formats: [{ id: "f1", format: "hooks", clips: [1] }], outputs: { o2: "f1" } }, "script");
    const pos = layout(b, [1, 2], ["o1", "o2"], true);
    expect(pos.product).toEqual({ x: 0, y: 0 });
    expect(pos.channel.x).toBe(0);
    expect(pos["clip-2"]).toEqual({ x: 5, y: 5 });
    expect(pos[`fmt-${MAIN_NODE}`].x).toBe(380);
    expect(pos["out-o1"].x).toBe(760);
    expect(pos["fmt-f1"].y).toBeGreaterThan(pos[`fmt-${MAIN_NODE}`].y);
    expect(pos["out-o2"].y).toBeGreaterThanOrEqual(pos["fmt-f1"].y);
  });
});

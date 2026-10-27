import { describe, expect, it } from "vitest";
import { popularQueries } from "./popular-queries";

describe("popularQueries", () => {
  it("tries the phrase, then '… tips' and '… ideas'", () => {
    expect(popularQueries("  calorie   counting ")).toEqual(["calorie counting", "calorie counting tips", "calorie counting ideas"]);
  });
  it("doesn't stack another ending on a phrase that already has one", () => {
    expect(popularQueries("accounting tips")).toEqual(["accounting tips"]);
    expect(popularQueries("reel ideas")).toEqual(["reel ideas"]);
  });
});

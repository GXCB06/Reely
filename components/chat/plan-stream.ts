import type { PlanRequest } from "@/app/api/plan/route";
import type { PlanEvent } from "@/lib/ai/schemas";

/** Calls /api/plan and hands each event (drafts, then the finished plan) to `onEvent` as it arrives. */
export async function streamPlan(body: PlanRequest, onEvent: (event: PlanEvent) => void): Promise<void> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`plan ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as PlanEvent);
      newline = buffer.indexOf("\n");
    }
  }
}

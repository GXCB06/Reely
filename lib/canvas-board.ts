// Canvas board view (v0.3 round 2, C3): the same canvas as the Steps view, drawn as fixed node types. Format nodes
// each take their own set of the canvas's clips; outputs hang off the node that made them. Pure (client and server).
import { CANVAS_FORMATS, type CanvasFormat } from "@/lib/canvas";

/** The node every canvas starts with: the Steps view's one format, using all of the canvas's clips. */
export const MAIN_NODE = "main";
/** Format nodes per board. */
export const MAX_FORMAT_NODES = 8;
/** A format node's id: letters, digits, _ or -, up to 20 (the board makes "f" + a base-36 time). */
export const NODE_ID = /^[\w-]{1,20}$/;

export type FormatNode = {
  id: string;
  format: CanvasFormat;
  instructions: string;
  /** Clip ids this node uses; null = all of the canvas's clips (the Steps view). */
  clips: number[] | null;
};

export type Board = {
  /** Node positions by node id (product, note, channel, clip-<id>, fmt-<id>, out-<id>). */
  positions: Record<string, { x: number; y: number }>;
  formats: FormatNode[];
  /** Which format node made each output (output id → node id); outputs not listed belong to the main node. */
  outputs: Record<string, string>;
};

const isFormat = (f: unknown): f is CanvasFormat => typeof f === "string" && (CANVAS_FORMATS as readonly string[]).includes(f);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * A canvas's stored board, whatever shape the row holds. Always has a main node (in the given default format), node
 * ids are unique, and clip lists are whole positive numbers.
 */
export function parseBoard(raw: unknown, defaultFormat: CanvasFormat): Board {
  const r = (raw ?? {}) as { positions?: unknown; formats?: unknown; outputs?: unknown };
  const positions: Board["positions"] = {};
  if (r.positions && typeof r.positions === "object") {
    for (const [k, v] of Object.entries(r.positions as Record<string, { x?: unknown; y?: unknown }>)) {
      if (k.length <= 40 && v && finite(v.x) && finite(v.y)) positions[k] = { x: Math.round(v.x), y: Math.round(v.y) };
    }
  }
  const seen = new Set<string>();
  const formats: FormatNode[] = [];
  for (const f of Array.isArray(r.formats) ? (r.formats as Partial<FormatNode>[]) : []) {
    if (!f || typeof f.id !== "string" || !NODE_ID.test(f.id) || seen.has(f.id) || !isFormat(f.format)) continue;
    seen.add(f.id);
    formats.push({
      id: f.id,
      format: f.format,
      instructions: typeof f.instructions === "string" ? f.instructions.slice(0, 300) : "",
      clips: Array.isArray(f.clips) ? [...new Set(f.clips.filter((c): c is number => Number.isInteger(c) && (c as number) > 0))] : null,
    });
    if (formats.length >= MAX_FORMAT_NODES) break;
  }
  if (!seen.has(MAIN_NODE)) formats.unshift({ id: MAIN_NODE, format: defaultFormat, instructions: "", clips: null });
  const outputs: Board["outputs"] = {};
  if (r.outputs && typeof r.outputs === "object") {
    for (const [k, v] of Object.entries(r.outputs as Record<string, unknown>)) if (typeof v === "string" && seen.has(v)) outputs[k] = v;
  }
  return { positions, formats, outputs };
}

/** The clips a format node uses, limited to the clips still on the canvas. */
export function nodeClips(node: FormatNode, canvasClips: number[]): number[] {
  return node.clips === null ? canvasClips : node.clips.filter((c) => canvasClips.includes(c));
}

/** The format node an output belongs to (the main node when it was made in the Steps view). */
export function outputNode(board: Board, outputId: string): string {
  return board.outputs[outputId] ?? MAIN_NODE;
}

/**
 * Where each node sits when the board has no saved position for it: inputs in a column on the left (product, note,
 * my channel, then clips), format nodes in the middle, each node's outputs in a column on the right.
 */
export function layout(board: Board, clipIds: number[], outputIds: string[], hasChannel: boolean): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  let y = 0;
  const left = ["product", "note", ...(hasChannel ? ["channel"] : []), ...clipIds.map((c) => `clip-${c}`)];
  for (const id of left) {
    pos[id] = board.positions[id] ?? { x: 0, y };
    y += id.startsWith("clip-") ? 120 : 150;
  }
  let fy = 0;
  let oy = 0;
  for (const f of board.formats) {
    const key = `fmt-${f.id}`;
    pos[key] = board.positions[key] ?? { x: 380, y: fy };
    const mine = outputIds.filter((o) => outputNode(board, o) === f.id);
    oy = Math.max(oy, pos[key].y);
    for (const o of mine) {
      pos[`out-${o}`] = board.positions[`out-${o}`] ?? { x: 760, y: oy };
      oy += 260;
    }
    fy = Math.max(fy + 320, oy);
  }
  return pos;
}

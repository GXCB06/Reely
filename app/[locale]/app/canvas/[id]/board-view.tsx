"use client";

import {
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Maximize2, Package, Plus, Sparkles, StickyNote, Trash2, TrendingUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Thumb } from "@/components/thumb";
import { useRouter } from "@/i18n/navigation";
import type { CanvasContent, CanvasFormat } from "@/lib/canvas";
import { type Board, layout, MAIN_NODE, MAX_FORMAT_NODES, nodeClips, outputNode } from "@/lib/canvas-board";
import type { CanvasClip, CanvasOutput, MyChannel } from "@/lib/canvas-data";
import { formatMultiplier } from "@/lib/scoring";
import { generateAction, saveBoardAction } from "../actions";
import { OutputCard } from "./output-card";

/** The first line a version leads with, for its small node on the board. */
function previewOf(c: CanvasContent): string {
  switch (c.format) {
    case "script":
    case "demo":
    case "shopReview":
      return c.title;
    case "hooks":
      return c.hooks[0]?.line ?? "";
    case "brief":
      return c.title;
    case "caption":
      return c.options[0]?.caption ?? "";
  }
}

type FormatData = {
  id: string;
  format: CanvasFormat;
  instructions: string;
  clips: number;
  formats: CanvasFormat[];
  generating: boolean;
  onChange: (patch: { format?: CanvasFormat; instructions?: string }) => void;
  onGenerate: () => void;
  onDelete: (() => void) | null;
};

const card = "rounded-2xl border bg-card text-card-foreground shadow-sm";
const handle = "!size-3 !border-2 !border-card !bg-primary";

function ProductNode({ data }: NodeProps<Node<{ name: string; label: string }>>) {
  return (
    <div className={`${card} w-60 p-3 text-sm`}>
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Package className="size-3.5 text-primary" /> {data.label}
      </p>
      <p className="mt-1 font-medium">{data.name}</p>
      <Handle type="source" position={Position.Right} className={handle} isConnectable={false} />
    </div>
  );
}

function NoteNode({ data }: NodeProps<Node<{ note: string; label: string; empty: string }>>) {
  return (
    <div className={`${card} w-60 p-3 text-sm`}>
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <StickyNote className="size-3.5 text-primary" /> {data.label}
      </p>
      <p className="mt-1 line-clamp-4 whitespace-pre-line">{data.note || <span className="text-muted-foreground">{data.empty}</span>}</p>
      <Handle type="source" position={Position.Right} className={handle} isConnectable={false} />
    </div>
  );
}

function ChannelNode({ data }: NodeProps<Node<{ channel: MyChannel; label: string; on: boolean }>>) {
  return (
    <div className={`${card} w-60 p-3 text-xs ${data.on ? "" : "opacity-50"}`}>
      <p className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
        <TrendingUp className="size-3.5 text-primary" /> {data.label}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {data.channel.points.slice(0, 3).map((p, i) => (
          <li key={i} className="line-clamp-2">
            {p}
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className={handle} isConnectable={false} />
    </div>
  );
}

function ClipNode({ data }: NodeProps<Node<{ clip: CanvasClip }>>) {
  const c = data.clip;
  return (
    <div className={`${card} flex w-60 items-center gap-2 p-2 text-xs`}>
      <span className="block w-9 shrink-0 overflow-hidden rounded-md">
        <span className="block aspect-[9/16]">
          <Thumb src={c.thumbnailUrl} videoId={c.id} className="h-full w-full object-cover" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          @{c.handle}
          {c.usual !== null && <span className="text-primary"> · {formatMultiplier(c.usual)}×</span>}
        </span>
        <span className="line-clamp-2 text-muted-foreground">{c.caption}</span>
      </span>
      {/* Drag from here to a format node to give it this clip. */}
      <Handle type="source" position={Position.Right} className={handle} />
    </div>
  );
}

function FormatNodeView({ data }: NodeProps<Node<FormatData>>) {
  const t = useTranslations("canvas");
  return (
    <div className={`${card} w-72 space-y-2 border-primary/40 p-3 text-sm`} data-board="format">
      <Handle type="target" position={Position.Left} className={handle} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">{t("board.formatNode")}</span>
        {data.onDelete && (
          <button type="button" onClick={data.onDelete} title={t("board.removeFormat")} className="nodrag rounded-full p-1 text-muted-foreground hover:bg-muted">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <select
        value={data.format}
        onChange={(e) => data.onChange({ format: e.target.value as CanvasFormat })}
        className="nodrag w-full rounded-full border bg-background px-2.5 py-1.5 text-sm"
      >
        {data.formats.map((f) => (
          <option key={f} value={f}>
            {t(`formats.${f}.name`)}
          </option>
        ))}
      </select>
      <input
        value={data.instructions}
        maxLength={300}
        onChange={(e) => data.onChange({ instructions: e.target.value })}
        placeholder={t("instructionsPlaceholder")}
        className="nodrag w-full rounded-full border bg-background px-2.5 py-1.5 text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("clips", { n: data.clips })}</span>
        <button
          type="button"
          onClick={data.onGenerate}
          disabled={data.generating}
          className="nodrag inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {data.generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {data.generating ? t("generating") : t("generate")}
        </button>
      </div>
      <Handle type="source" position={Position.Right} className={handle} isConnectable={false} />
    </div>
  );
}

function OutputNode({ data }: NodeProps<Node<{ output: CanvasOutput; onOpen: () => void }>>) {
  const t = useTranslations("canvas");
  const o = data.output;
  const r = o.posted?.result;
  return (
    <div className={`${card} w-64 space-y-1.5 p-3 text-sm`}>
      <Handle type="target" position={Position.Left} className={handle} isConnectable={false} />
      <p className="text-xs text-muted-foreground">
        {t(`formats.${o.format}.name`)}
        {o.refine && <> · {t(`refines.${o.refine}`)}</>}
      </p>
      <p className="line-clamp-3 font-medium">{previewOf(o.content)}</p>
      {r && (
        <p className="text-xs font-medium text-emerald-700">
          ✓ {r.x !== null ? t("posted.x", { x: formatMultiplier(r.x) }) : t("posted.iPosted")}
        </p>
      )}
      <button type="button" onClick={data.onOpen} className="nodrag inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Maximize2 className="size-3" /> {t("board.open")}
      </button>
    </div>
  );
}

const nodeTypes = { product: ProductNode, note: NoteNode, channel: ChannelNode, clip: ClipNode, format: FormatNodeView, output: OutputNode };

/**
 * The canvas as a board (React Flow): inputs on the left, format nodes in the middle, versions on the right. Drag a
 * clip onto a format node to give it that clip; each format node generates with its own clips. Positions and nodes
 * save themselves. Same canvas, same versions and the same cost (0 credits) as the Steps view.
 */
export function BoardView({
  canvasId,
  productName,
  note,
  clips,
  channel,
  useMyChannel,
  outputs,
  initialBoard,
  formats,
  perDay,
}: {
  canvasId: string;
  productName: string;
  note: string;
  clips: CanvasClip[];
  channel: MyChannel | null;
  useMyChannel: boolean;
  outputs: CanvasOutput[];
  initialBoard: Board;
  formats: CanvasFormat[];
  perDay: number;
}) {
  const t = useTranslations("canvas");
  const locale = useLocale();
  const router = useRouter();
  const [edited, setBoard] = useState<Board>(initialBoard);
  // Which node made each version is recorded by the server, so it always comes from the latest props (a version
  // generated a moment ago would otherwise show under the main node until a reload).
  const board = useMemo(() => ({ ...edited, outputs: initialBoard.outputs }), [edited, initialBoard.outputs]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [opened, setOpened] = useState<CanvasOutput | null>(null);
  const [, start] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipIds = useMemo(() => clips.map((c) => c.id), [clips]);

  // Every change is saved shortly after the last one (positions while dragging, node edits while typing).
  function persist(next: Board) {
    setBoard(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveBoardAction(canvasId, { positions: next.positions, formats: next.formats }), 600);
  }
  useEffect(() => () => void (saveTimer.current && clearTimeout(saveTimer.current)), []);

  const patchFormat = (id: string, patch: Partial<Board["formats"][number]>) =>
    persist({ ...board, formats: board.formats.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  function generate(id: string) {
    const node = board.formats.find((f) => f.id === id);
    if (!node) return;
    setGenerating(id);
    start(async () => {
      // The server reads this node's clips from the saved board, so save it first.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveBoardAction(canvasId, { positions: board.positions, formats: board.formats });
      const res = await generateAction(canvasId, node.format, node.instructions.trim(), locale, null, id);
      setGenerating(null);
      if (!res.ok) return void toast.error(res.error === "limit" ? t("limit", { n: perDay }) : t("failed"));
      router.refresh();
    });
  }

  const positions = useMemo(() => layout(board, clipIds, outputs.map((o) => o.id), !!channel), [board, clipIds, outputs, channel]);

  const nodes: Node[] = useMemo(() => {
    const at = (id: string) => positions[id] ?? { x: 0, y: 0 };
    return [
      { id: "product", type: "product", position: at("product"), data: { name: productName, label: t("product") } },
      { id: "note", type: "note", position: at("note"), data: { note, label: t("note"), empty: t("board.noNote") } },
      ...(channel ? [{ id: "channel", type: "channel", position: at("channel"), data: { channel, label: t("myChannel"), on: useMyChannel } }] : []),
      ...clips.map((c) => ({ id: `clip-${c.id}`, type: "clip", position: at(`clip-${c.id}`), data: { clip: c } })),
      ...board.formats.map((f) => ({
        id: `fmt-${f.id}`,
        type: "format",
        position: at(`fmt-${f.id}`),
        data: {
          id: f.id,
          format: f.format,
          instructions: f.instructions,
          clips: nodeClips(f, clipIds).length,
          formats,
          generating: generating === f.id,
          onChange: (patch: { format?: CanvasFormat; instructions?: string }) => patchFormat(f.id, patch),
          onGenerate: () => generate(f.id),
          onDelete: f.id === MAIN_NODE ? null : () => persist({ ...board, formats: board.formats.filter((x) => x.id !== f.id) }),
        } satisfies FormatData,
      })),
      ...outputs
        .filter((o) => board.formats.some((f) => f.id === outputNode(board, o.id)))
        .map((o) => ({ id: `out-${o.id}`, type: "output", position: at(`out-${o.id}`), data: { output: o, onOpen: () => setOpened(o) } })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, board, clips, outputs, channel, useMyChannel, note, productName, generating, formats]);

  const edges: Edge[] = useMemo(() => {
    const line = { stroke: "var(--primary)", strokeWidth: 2 };
    const faint = { stroke: "var(--muted-foreground)", strokeWidth: 1.5, opacity: 0.5 };
    return board.formats.flatMap((f) => [
      { id: `p-${f.id}`, source: "product", target: `fmt-${f.id}`, style: faint, deletable: false },
      ...(note ? [{ id: `n-${f.id}`, source: "note", target: `fmt-${f.id}`, style: faint, deletable: false }] : []),
      ...(channel && useMyChannel ? [{ id: `c-${f.id}`, source: "channel", target: `fmt-${f.id}`, style: faint, deletable: false }] : []),
      ...nodeClips(f, clipIds).map((c) => ({ id: `clip-${c}-${f.id}`, source: `clip-${c}`, target: `fmt-${f.id}`, style: line })),
      ...outputs
        .filter((o) => outputNode(board, o.id) === f.id)
        .map((o) => ({ id: `o-${o.id}`, source: `fmt-${f.id}`, target: `out-${o.id}`, style: line, deletable: false })),
    ]);
  }, [board, clipIds, outputs, note, channel, useMyChannel]);

  function onNodesChange(changes: NodeChange[]) {
    const moved = applyNodeChanges(changes, nodes);
    const next = { ...board.positions };
    let changed = false;
    for (const ch of changes) {
      if (ch.type !== "position" || !ch.position) continue;
      const n = moved.find((m) => m.id === ch.id);
      if (n) {
        next[ch.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
        changed = true;
      }
    }
    if (changed) persist({ ...board, positions: next });
  }

  /** Clip → format node: that node now uses the clip. */
  function onConnect(c: Connection) {
    const clip = Number(c.source?.replace(/^clip-/, ""));
    const id = c.target?.replace(/^fmt-/, "");
    const node = board.formats.find((f) => f.id === id);
    if (!node || !Number.isInteger(clip) || !c.source?.startsWith("clip-")) return;
    const current = nodeClips(node, clipIds);
    if (!current.includes(clip)) patchFormat(node.id, { clips: [...current, clip] });
  }

  /** Removing a clip's line takes the clip off that format node only. */
  function onEdgesDelete(removed: Edge[]) {
    let next = board;
    for (const e of removed) {
      const m = e.id.match(/^clip-(\d+)-(.+)$/);
      if (!m) continue;
      next = {
        ...next,
        formats: next.formats.map((f) => (f.id === m[2] ? { ...f, clips: nodeClips(f, clipIds).filter((c) => c !== Number(m[1])) } : f)),
      };
    }
    if (next !== board) persist(next);
  }

  function addFormat() {
    if (board.formats.length >= MAX_FORMAT_NODES) return void toast.error(t("board.maxFormats", { n: MAX_FORMAT_NODES }));
    const id = `f${Date.now().toString(36)}`;
    const lowest = Math.max(0, ...board.formats.map((f) => positions[`fmt-${f.id}`]?.y ?? 0));
    persist({
      ...board,
      formats: [...board.formats, { id, format: formats[0], instructions: "", clips: [] }],
      positions: { ...board.positions, [`fmt-${id}`]: { x: 380, y: lowest + 320 } },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addFormat} className="chip" data-board="add-format">
          <Plus className="size-3.5" /> {t("board.addFormat")}
        </button>
        <span className="text-xs text-muted-foreground">{t("board.hint")}</span>
      </div>
      <div className="h-[72vh] min-h-[560px] overflow-hidden rounded-3xl border bg-muted/30" data-board="flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          // Fit again once every node has its real size (custom nodes are measured after the first paint).
          onInit={(flow) => setTimeout(() => void flow.fitView({ padding: 0.15 }), 60)}
          minZoom={0.2}
          // Reely is light-only; "system" would put React Flow's dark class on the board and flip the theme inside it.
          colorMode="light"
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {opened && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpened(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpened(null)} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <X className="size-4" /> {t("close")}
            </button>
            <OutputCard canvasId={canvasId} output={outputs.find((o) => o.id === opened.id) ?? opened} perDay={perDay} />
          </div>
        </div>
      )}
    </div>
  );
}

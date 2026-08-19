import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphResponse } from "../../types";
import { LayersIcon, SearchIcon, CloseIcon } from "../icons";

interface Props {
  data: GraphResponse | null;
  loading: boolean;
  error: string | null;
}

const COLOR_HIGHLIGHT = "#10a37f";
const COLOR_OVERLAP = "#e0a165";
const COLOR_ENTITY = "#6b7fd9";
const COLOR_LINK = "rgba(148, 158, 174, 0.4)";
const COLOR_LINK_HIGHLIGHT = "rgba(16, 163, 127, 0.6)";
const FULL_VIEW_CAP = 60; // showing every entity in a 200+ page doc at once is unreadable no matter how it's drawn

type Mode = "focused" | "full";

function nodeColor(id: string, highlighted: Set<string>, overlap: Set<string>, selected: string | null) {
  if (id === selected) return "#ffffff";
  if (highlighted.has(id)) return COLOR_HIGHLIGHT;
  if (overlap.has(id)) return COLOR_OVERLAP;
  return COLOR_ENTITY;
}

export function GraphView({ data, loading, error }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ink, setInk] = useState("#1a1a1a");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const hasHighlights = (data?.highlighted_node_ids?.length ?? 0) > 0;
  const [mode, setMode] = useState<Mode>("focused");

  useEffect(() => {
    setMode(hasHighlights ? "focused" : "full");
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    if (resolved) setInk(resolved);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const highlighted = useMemo(() => new Set(data?.highlighted_node_ids ?? []), [data]);
  const overlap = useMemo(() => new Set(data?.overlap_node_ids ?? []), [data]);

  // Only entities are ever shown — chunk nodes are the graph's internal plumbing, not
  // something a person can read meaning into.
  const entityNodes = useMemo(() => data?.nodes.filter((n) => n.kind === "entity") ?? [], [data]);
  const entityIds = useMemo(() => new Set(entityNodes.map((n) => n.id)), [entityNodes]);
  const entityEdges = useMemo(
    () => (data?.edges ?? []).filter((e) => entityIds.has(e.source) && entityIds.has(e.target)),
    [data, entityIds],
  );

  const neighborsOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of entityEdges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [entityEdges]);

  const degreeOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, neighbors] of neighborsOf) map.set(id, neighbors.size);
    return map;
  }, [neighborsOf]);

  const nodeById = useMemo(() => new Map(entityNodes.map((n) => [n.id, n])), [entityNodes]);

  const searchMatch = search.trim().toLowerCase();
  const searchedNode = searchMatch
    ? entityNodes.find((n) => n.label.toLowerCase().includes(searchMatch))
    : undefined;

  const focusNodeId = selected ?? searchedNode?.id ?? null;

  const { visibleNodes, visibleEdges, truncated } = useMemo(() => {
    if (entityNodes.length === 0) return { visibleNodes: [], visibleEdges: [], truncated: false };

    let keepIds: Set<string>;
    if (focusNodeId) {
      // One node plus its direct neighbors — this is the "explain one thing clearly"
      // view, and it's what a click or search result should always land on.
      keepIds = new Set([focusNodeId, ...(neighborsOf.get(focusNodeId) ?? [])]);
    } else if (mode === "focused" && hasHighlights) {
      // The nodes this exact question actually touched, plus their immediate
      // neighbors — small and directly answers "what did my question use".
      keepIds = new Set(highlighted);
      for (const id of highlighted) for (const n of neighborsOf.get(id) ?? []) keepIds.add(n);
      keepIds = new Set([...keepIds].filter((id) => entityIds.has(id)));
    } else {
      keepIds = new Set(entityIds);
    }

    let nodes = entityNodes.filter((n) => keepIds.has(n.id));
    let truncated = false;
    if (nodes.length > FULL_VIEW_CAP) {
      nodes = [...nodes].sort((a, b) => (degreeOf.get(b.id) ?? 0) - (degreeOf.get(a.id) ?? 0)).slice(0, FULL_VIEW_CAP);
      truncated = true;
    }
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = entityEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { visibleNodes: nodes, visibleEdges: edges, truncated };
  }, [entityNodes, entityEdges, entityIds, neighborsOf, degreeOf, mode, hasHighlights, highlighted, focusNodeId]);

  const graphData = useMemo(
    () => ({ nodes: visibleNodes.map((n) => ({ ...n })), links: visibleEdges.map((e) => ({ ...e })) }),
    [visibleNodes, visibleEdges],
  );

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-200);
    fg.d3Force("link")?.distance(60);
  }, [graphData]);

  const selectedDetail = selected ? nodeById.get(selected) : undefined;
  const selectedNeighbors = selected
    ? [...(neighborsOf.get(selected) ?? [])].map((id) => nodeById.get(id)).filter((n): n is NonNullable<typeof n> => !!n)
    : [];

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!data || entityNodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <LayersIcon width={26} height={26} />
        </div>
        <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>
          {loading ? "Building graph…" : "No graph yet"}
        </p>
        <p className="max-w-xs text-sm" style={{ color: "var(--muted)" }}>
          Activate documents and ask a question — the entities it used will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex shrink-0 items-center gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
          {([
            ["focused", hasHighlights ? "This answer" : "Focused"],
            ["full", "Full graph"],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setSelected(null);
              }}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: mode === m && !focusNodeId ? "var(--surface)" : "transparent",
                color: mode === m && !focusNodeId ? "var(--ink)" : "var(--muted)",
                boxShadow: mode === m && !focusNodeId ? "var(--shadow-sm)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5"
          style={{ background: "var(--surface-2)", maxWidth: 260 }}
        >
          <SearchIcon width={13} height={13} style={{ color: "var(--muted)" }} className="shrink-0" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
            placeholder="Find an entity…"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-60"
            style={{ color: "var(--ink)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--muted)" }}>
              <CloseIcon width={12} height={12} />
            </button>
          )}
        </div>

        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {visibleNodes.length} of {entityNodes.length} entities
          {truncated ? " (top connected shown)" : ""}
        </span>

        <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
          {hasHighlights && <Legend swatch={COLOR_HIGHLIGHT} label="In this answer" />}
          <Legend swatch={COLOR_OVERLAP} label="Cross-document" />
          <Legend swatch={COLOR_ENTITY} label="Entity" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={containerRef} className="min-h-0 min-w-0 flex-1">
          {size.width > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              nodeId="id"
              onNodeClick={(n: any) => setSelected(n.id)}
              onBackgroundClick={() => setSelected(null)}
              nodeLabel={(n: any) => `${n.label}${n.type ? ` (${n.type})` : ""}`}
              nodeRelSize={4}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const isSelected = node.id === selected;
                const isHighlighted = highlighted.has(node.id);
                const radius = isSelected ? 7 : isHighlighted ? 6 : 4.5;

                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = nodeColor(node.id, highlighted, overlap, selected);
                ctx.fill();
                if (isSelected) {
                  ctx.lineWidth = 2 / globalScale;
                  ctx.strokeStyle = COLOR_HIGHLIGHT;
                  ctx.stroke();
                }

                // Small graphs (focused view, or after clicking/searching a node) can
                // afford every label visible; the uncapped full graph can't — there,
                // only the important nodes get a permanent label, rest show on hover.
                const showLabel =
                  graphData.nodes.length <= 25 || isSelected || isHighlighted || (degreeOf.get(node.id) ?? 0) >= 4;
                if (!showLabel) return;

                const fontSize = Math.max(3.5, 12 / globalScale);
                ctx.font = `${isSelected || isHighlighted ? "600" : "400"} ${fontSize}px -apple-system, sans-serif`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillStyle = ink;
                ctx.fillText(node.label, node.x + radius + 3, node.y);
              }}
              linkColor={(l: any) => {
                const s = l.source?.id ?? l.source;
                const t = l.target?.id ?? l.target;
                return highlighted.has(s) && highlighted.has(t) ? COLOR_LINK_HIGHLIGHT : COLOR_LINK;
              }}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              linkWidth={1}
              backgroundColor="rgba(0,0,0,0)"
              width={size.width}
              height={size.height}
            />
          )}
        </div>

        {selectedDetail && (
          <div
            className="scroll-thin w-64 shrink-0 overflow-y-auto border-l p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {selectedDetail.label}
              </p>
              <button onClick={() => setSelected(null)} style={{ color: "var(--muted)" }}>
                <CloseIcon width={14} height={14} />
              </button>
            </div>
            {selectedDetail.type && (
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-medium capitalize"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {selectedDetail.type}
              </span>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {selectedDetail.source_files.join(", ") || "—"}
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Connected to ({selectedNeighbors.length})
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {selectedNeighbors.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelected(n.id)}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--ink)" }}
                    title={n.label}
                  >
                    {n.label}
                  </button>
                </li>
              ))}
              {selectedNeighbors.length === 0 && (
                <li className="text-xs" style={{ color: "var(--muted)" }}>
                  No direct connections.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />
      {label}
    </span>
  );
}

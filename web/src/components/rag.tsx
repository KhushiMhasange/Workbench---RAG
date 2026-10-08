"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, CornerTicks, DotMatrix, IconButton, Tooltip, type Tone } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

/* Shared RAG components per DESIGN.md section 10. Canonical Chunk, Source,
   RetrievalScore, PipelineRail, outcomes. No look-alikes elsewhere. */

export type Passage = {
  key: string;
  rank: number;
  chunkId: string;
  docId: string;
  filename: string;
  page: number | null;
  heading: string | null;
  text: string;
  score: number | null;
};

export function toPassages(sources: {
  chunk_id?: string;
  id?: string;
  doc_id?: string;
  filename?: string;
  source?: string;
  page?: number | null;
  heading?: string | null;
  text?: string;
  score?: number | null;
  rank?: number;
}[]): Passage[] {
  return sources.map((s, i) => ({
    key: String(s.chunk_id ?? s.id ?? i),
    rank: s.rank ?? i + 1,
    chunkId: String(s.chunk_id ?? s.id ?? ""),
    docId: String(s.doc_id ?? ""),
    filename: String(s.filename ?? s.source ?? ""),
    page: s.page ?? null,
    heading: s.heading ?? null,
    text: String(s.text ?? ""),
    score: typeof s.score === "number" ? s.score : null,
  }));
}

/* PipelineRail ---------------------------------------------------------- */

export type RailState = "pending" | "active" | "complete" | "skipped" | "attention" | "failed";
export type RailStage = {
  id: string;
  label: string;
  count?: string;
  state: RailState;
  hint?: string;
};

const RAIL_NODE: Record<RailState, string> = {
  pending: "border-border-strong bg-transparent",
  active: "border-primary bg-primary",
  complete: "border-text-secondary bg-transparent",
  skipped: "border-dashed border-border-strong bg-transparent",
  attention: "border-warning bg-warning-muted",
  failed: "border-error bg-error-muted",
};

export function PipelineRail({
  stages,
  compact = false,
  onSelect,
  ariaLabel = "Pipeline progress",
}: {
  stages: RailStage[];
  compact?: boolean;
  onSelect?: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <ol aria-label={ariaLabel} className={`flex ${compact ? "h-7" : "min-h-14"} items-center gap-0`}>
        {stages.map((stage, i) => {
          const clickable = onSelect != null;
          const prevComplete = i > 0 && stages[i - 1].state === "complete";
          const node = (
            <>
              <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${RAIL_NODE[stage.state]} ${
                  stage.state === "active" ? "[animation:rail-pulse_1.2s_infinite]" : ""
                }`}
              >
                {stage.state === "complete" ? (
                  <Icon name="check" size={14} className="text-text-secondary" />
                ) : stage.state === "failed" ? (
                  <Icon name="x" size={14} className="text-error" />
                ) : stage.state === "attention" ? (
                  <Icon name="alertTriangle" size={14} className="text-warning" />
                ) : stage.state === "active" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-text-on-primary" />
                ) : (
                  <span className="h-1.5 w-1.5 bg-border-strong" />
                )}
              </span>
              <span className="ml-2">
                <span className="block tx-label text-text">{stage.label}</span>
                {stage.count != null && !compact ? (
                  <span className="block tx-mono-sm text-text-muted tabular">{stage.count}</span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={stage.id} className="flex min-w-0 items-center">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-px w-8 shrink-0 ${prevComplete && stage.state !== "pending" ? "bg-border-strong" : "bg-accent-line"}`}
                />
              ) : null}
              <span className="sr-only">{`${stage.label}, ${stage.state}${stage.hint ? `. ${stage.hint}` : ""}`}</span>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(stage.id)}
                  aria-label={`${stage.label}, ${stage.state}`}
                  className="flex items-center rounded-sm px-1 py-1 text-left hover:bg-surface-hover"
                >
                  {node}
                </button>
              ) : (
                <span aria-hidden="true" className="flex items-center px-1 py-1">
                  {node}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!compact ? (
        <span aria-hidden="true" className="absolute bottom-0 left-0">
          <DotMatrix />
        </span>
      ) : null}
    </div>
  );
}

/* RetrievalScore -------------------------------------------------------- */

export function RetrievalScore({
  score,
  compact = false,
  highlight = false,
}: {
  score: number | null;
  compact?: boolean;
  highlight?: boolean;
}) {
  if (score == null) {
    return <span className="tx-mono-sm text-text-muted">–</span>;
  }
  return (
    <Tooltip label="Cosine similarity between your question and this passage. Higher means more similar.">
      <span className="inline-flex items-center gap-1">
        <span className="tx-mono-sm text-text-secondary tabular">{score.toFixed(2)}</span>
        <span
          aria-hidden="true"
          className={`${compact ? "h-1 w-6" : "h-1 w-20"} overflow-hidden rounded-xs bg-border`}
        >
          <span
            className={`block h-full ${highlight ? "bg-primary" : "bg-text-secondary"}`}
            style={{ width: `${Math.max(0, Math.min(1, score)) * 100}%` }}
          />
        </span>
      </span>
    </Tooltip>
  );
}

/* Source ---------------------------------------------------------------- */

export function SourceChip({ filename, onOpen }: { filename: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${filename} in Corpus`}
      className="inline-flex h-7 max-w-56 items-center gap-1 rounded-sm border border-border bg-surface px-2 tx-label text-text-secondary hover:border-border-strong hover:text-text"
    >
      <Icon name="file" size={14} />
      <span className="truncate">{filename}</span>
    </button>
  );
}

export function SourceRow({
  rank,
  filename,
  location,
  score,
  cited,
  selected,
  onSelect,
  onOpen,
}: {
  rank: number;
  filename: string;
  location: string;
  score: number | null;
  cited: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <li
      className={`flex min-h-10 items-center gap-2 border-b border-border px-3 last:border-b-0 ${selected ? "border-l-2 border-l-primary bg-primary-muted" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Citation ${rank}, ${filename}${location ? `, ${location}` : ""}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-2 text-left"
      >
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-primary-border bg-primary-muted px-1 tx-mono-sm font-semibold text-primary-text">
          {rank}
        </span>
        <Icon name="file" size={16} className="text-text-muted" />
        <span className="min-w-0 flex-1 truncate tx-body text-text">{filename}</span>
        {location ? <span className="shrink-0 tx-caption text-text-muted">{location}</span> : null}
        <RetrievalScore score={score} compact highlight={selected || cited} />
      </button>
      <IconButton label={`Open ${filename} in Corpus`} icon="link" size={28} onClick={onOpen} />
    </li>
  );
}

/* Chunk ----------------------------------------------------------------- */

export type ChunkRole = "cited" | "retrieved" | "considered" | "expected" | null;

const ROLE_BADGE: Record<Exclude<ChunkRole, null>, { label: string; tone: Tone }> = {
  cited: { label: "Cited", tone: "accent" },
  retrieved: { label: "Retrieved", tone: "info" },
  considered: { label: "Considered", tone: "neutral" },
  expected: { label: "Expected", tone: "neutral" },
};

export function Chunk({
  passage,
  role = null,
  expanded,
  selected,
  onSelect,
}: {
  passage: Passage;
  role?: ChunkRole;
  expanded?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = expanded ?? open;
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="tx-mono-sm text-text-muted tabular">{passage.chunkId.slice(0, 21)}</span>
        <SourceChip filename={passage.filename} onOpen={() => onSelect?.()} />
        {passage.page != null ? <span className="tx-caption text-text-muted">p. {passage.page}</span> : null}
        {passage.heading ? <span className="truncate tx-caption text-text-muted">{passage.heading}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {role ? <Badge tone={ROLE_BADGE[role].tone}>{ROLE_BADGE[role].label}</Badge> : null}
          {passage.score != null ? <RetrievalScore score={passage.score} compact /> : null}
        </span>
      </div>
      {isOpen ? (
        <p className="mt-2 rounded-sm border border-border bg-bg p-3 tx-reading text-text">{passage.text}</p>
      ) : (
        <p className="mt-1 line-clamp-2 tx-body text-text">{passage.text}</p>
      )}
    </>
  );
  if (!onSelect && expanded === undefined) {
    return <div className="rounded-sm border border-border bg-surface-sunken px-3 py-2">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (expanded === undefined) setOpen((v) => !v);
        onSelect?.();
      }}
      aria-expanded={isOpen}
      className={`block w-full rounded-sm border px-3 py-2 text-left transition-colors duration-[80ms] hover:bg-surface-hover ${
        selected ? "border-primary-border border-l-2 bg-primary-muted" : "border-border bg-surface-sunken"
      }`}
    >
      {body}
    </button>
  );
}

/* ContextViewer ---------------------------------------------------------- */

export function ContextViewer({
  passage,
  position,
  total,
  onPrev,
  onNext,
  onOpenInCorpus,
}: {
  passage: Passage;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenInCorpus: () => void;
}) {
  return (
    <section aria-label="Passage context" className="chamfer-md-clip chamfer-focus relative border border-border bg-surface">
      <CornerTicks />
      <header className="border-b border-border px-3 py-2">
        <p className="tx-label text-text">{passage.filename}</p>
        <p className="tx-mono-sm text-text-muted">
          {[passage.page != null ? `p. ${passage.page}` : null, passage.heading, passage.chunkId]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      <p className="bg-surface-sunken px-3 py-3 tx-reading text-text">{passage.text}</p>
      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onPrev} disabled={position <= 0}>
            Previous
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} disabled={position >= total - 1}>
            Next
          </Button>
        </div>
        <span className="tx-mono-sm text-text-muted tabular">
          {position + 1} of {total}
        </span>
        <Button variant="ghost" size="sm" icon="link" onClick={onOpenInCorpus}>
          Open in Corpus
        </Button>
      </footer>
    </section>
  );
}

/* RetrievalTrace --------------------------------------------------------- */

export function RetrievalTrace({
  kept,
  best,
  latencyMs,
}: {
  kept: number;
  best: number | null;
  latencyMs: number | null;
}) {
  const rows: [string, string][] = [
    ["Passages kept", String(kept)],
    ["Best similarity", best != null ? best.toFixed(2) : "–"],
    ["Answer latency", latencyMs != null ? `${latencyMs} ms` : "–"],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-sm border border-border bg-surface px-2 py-1">
          <dt className="tx-caption text-text-muted">{k}</dt>
          <dd className="tx-mono text-text tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ProcessingStatus ------------------------------------------------------- */

export type IngestBadge = { label: string; tone: Tone; icon: IconName; detail?: string };

export function processingStatus(status: string, error?: string): IngestBadge {
  switch (status) {
    case "ready":
      return { label: "Indexed", tone: "positive", icon: "checkCircle" };
    case "failed":
      return { label: "Failed", tone: "critical", icon: "alertCircle", detail: error };
    case "parsing":
      return { label: "Processing", tone: "info", icon: "refresh" };
    case "embedding":
      return { label: "Embedding", tone: "info", icon: "refresh" };
    case "chunking":
      return { label: "Chunking", tone: "info", icon: "refresh" };
    default:
      return { label: "Uploaded", tone: "neutral", icon: "upload" };
  }
}

export function ProcessingStatus({ status, error }: { status: string; error?: string }) {
  const s = processingStatus(status, error);
  const spinning = s.label === "Processing" || s.label === "Embedding" || s.label === "Chunking";
  return (
    <span title={error || s.label}>
      <Badge tone={s.tone} icon={spinning ? undefined : s.icon}>
        {spinning ? (
          <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        ) : null}
        {s.label}
      </Badge>
    </span>
  );
}

/* MetricCard + EvaluationScore ------------------------------------------- */

export function MetricCard({
  name,
  info,
  value,
  unit,
  delta,
  sampleSize,
  thresholdNote,
  selected,
  onSelect,
}: {
  name: string;
  info?: string;
  value: string;
  unit?: string;
  delta?: { text: string; kind: "improvement" | "regression" | "neutral" };
  sampleSize?: string;
  thresholdNote?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const deltaStyle =
    delta?.kind === "improvement"
      ? "text-success"
      : delta?.kind === "regression"
        ? "text-error"
        : "text-text-muted";
  const deltaIcon = delta?.kind === "improvement" ? "↑" : delta?.kind === "regression" ? "↓" : "–";
  const body = (
    <>
      <p className="flex items-center gap-1 tx-label text-text-secondary">
        {name}
        {info ? (
          <Tooltip label={info}>
            <span className="text-text-muted">
              <Icon name="info" size={14} />
            </span>
          </Tooltip>
        ) : null}
      </p>
      <p className="mt-1 tx-display tabular">
        {value}
        {unit ? <span className="ml-1 tx-body text-text-secondary">{unit}</span> : null}
      </p>
      {delta ? (
        <p className={`mt-1 tx-caption tabular ${deltaStyle}`}>
          <span aria-hidden="true">{deltaIcon}</span> {delta.text}
        </p>
      ) : null}
      <p className="mt-1 tx-mono-sm text-text-muted">{sampleSize ?? ""}</p>
      {thresholdNote ? <p className="mt-0.5 tx-caption text-text-muted">{thresholdNote}</p> : null}
    </>
  );
  if (!onSelect) {
    return (
      <div className={`chamfer-md-clip chamfer-focus relative border border-border bg-surface p-4 ${selected ? "border-primary-border" : ""}`}>
        <CornerTicks />
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`chamfer-md-clip chamfer-focus block w-full border bg-surface p-4 text-left hover:bg-surface-hover ${selected ? "border-primary-border" : "border-border"}`}
    >
      {body}
    </button>
  );
}

export type ScoreState = "pass" | "fail" | "skipped" | "error" | "running";

export function EvaluationScore({ state, score }: { state: ScoreState; score?: string }) {
  const map: Record<ScoreState, { tone: Tone; icon: IconName; label: string }> = {
    pass: { tone: "positive", icon: "checkCircle", label: "Pass" },
    fail: { tone: "critical", icon: "xCircle", label: "Fail" },
    skipped: { tone: "neutral", icon: "dot", label: "Skipped" },
    error: { tone: "critical", icon: "alertCircle", label: "Error" },
    running: { tone: "info", icon: "refresh", label: "Running" },
  };
  const m = map[state];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={m.tone} icon={m.icon}>
        {m.label}
      </Badge>
      {score != null ? <span className="tx-mono-sm text-text-secondary tabular">{score}</span> : null}
    </span>
  );
}

export function StripCell({ state, label }: { state: ScoreState; label: string }) {
  const style: Record<ScoreState, string> = {
    pass: "border-success bg-success-muted text-success",
    fail: "border-error bg-error-muted text-error",
    skipped: "border-border bg-surface-sunken text-text-muted",
    error: "border-error bg-error-muted text-error",
    running: "border-info bg-info-muted text-info",
  };
  const glyph: Record<ScoreState, IconName> = {
    pass: "check",
    fail: "x",
    skipped: "dot",
    error: "alertCircle",
    running: "refresh",
  };
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-sm border ${style[state]}`}
    >
      <Icon name={glyph[state]} size={14} />
    </span>
  );
}

/* QueryInput ------------------------------------------------------------- */

export function QueryInput({
  value,
  onChange,
  onSubmit,
  onStop,
  submitting,
  disabled,
  disabledHint,
  scopeLine,
  onScopeClick,
  topK,
  onTopK,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  submitting: boolean;
  disabled: boolean;
  disabledHint?: string;
  scopeLine: string;
  onScopeClick: () => void;
  topK: number;
  onTopK: (k: number) => void;
}) {
  const lastRef = useRef("");
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting) onStop();
          else if (value.trim() && !disabled) {
            lastRef.current = value.trim();
            onSubmit();
          }
        }}
        className="chamfer-md-clip chamfer-focus relative border border-border-input bg-surface p-2"
      >
        <CornerTicks />
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about this workspace
        </label>
        <textarea
          id="ask-input"
          rows={2}
          value={value}
          disabled={disabled}
          placeholder="Ask a question about this workspace"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (submitting) onStop();
              else if (value.trim() && !disabled) {
                lastRef.current = value.trim();
                onSubmit();
              }
            } else if (e.key === "ArrowUp" && !value && lastRef.current) {
              e.preventDefault();
              onChange(lastRef.current);
            } else if (e.key === "Escape" && submitting) {
              e.preventDefault();
              onStop();
            }
          }}
          className="max-h-36 min-h-14 w-full resize-y bg-transparent px-2 py-1 tx-body text-text placeholder:text-text-muted focus:outline-none disabled:text-text-muted"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="tx-caption text-text-muted">Enter to ask · Shift+Enter for a new line</span>
          {submitting ? (
            <Button variant="secondary" size="md" icon="stop" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" size="md" type="submit" disabled={disabled || !value.trim()}>
              Ask
            </Button>
          )}
        </div>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="tx-caption text-text-muted">{scopeLine}</span>
        <button
          type="button"
          onClick={onScopeClick}
          className="rounded-sm px-1 tx-caption text-primary-text underline hover:text-primary"
        >
          Change scope
        </button>
        <span className="ml-auto flex items-center gap-1 tx-caption text-text-muted">
          <label htmlFor="ask-topk">Top k</label>
          <select
            id="ask-topk"
            value={topK}
            onChange={(e) => onTopK(Number(e.target.value))}
            className="h-7 rounded-sm border border-border-input bg-surface px-1 tx-caption text-text"
          >
            {[2, 4, 6, 8].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </span>
      </div>
      {disabled && disabledHint ? (
        <p role="status" className="mt-2 tx-caption text-text-muted">
          {disabledHint}
        </p>
      ) : null}
    </div>
  );
}

/* Outcome panels --------------------------------------------------------- */

export function GatedPanel({
  best,
  passages,
  onOpenCorpus,
}: {
  best: number | null;
  passages: Passage[];
  onOpenCorpus: () => void;
}) {
  return (
    <section aria-label="No sufficiently relevant passages found" className="chamfer-md-clip chamfer-focus relative border border-info bg-info-muted px-4 py-3">
      <CornerTicks />
      <h3 className="flex items-center gap-2 tx-h3 text-text">
        <Icon name="searchMinus" size={20} className="text-info" />
        No sufficiently relevant passages found
      </h3>
      <p className="mt-1 tx-body text-text">
        {best != null
          ? `The best match scored ${best.toFixed(2)}, below the minimum. Nothing was sent to the model.`
          : "No passage matched closely enough. Nothing was sent to the model."}
      </p>
      {passages.length ? (
        <div className="mt-3">
          <h4 className="tx-label text-text-secondary">Closest passages found</h4>
          <ul className="mt-1 space-y-1">
            {passages.slice(0, 3).map((p) => (
              <li key={p.key}>
                <Chunk passage={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenCorpus}>
          Open Corpus
        </Button>
      </div>
    </section>
  );
}

export function GuardWarningPanel({ reasons }: { reasons: string[] }) {
  const [open, setOpen] = useState(false);
  const flags = reasons.length ? reasons : ["claim_not_in_cited_passage"];
  return (
    <section aria-label="Unverified answer warning" className="chamfer-md-clip chamfer-focus relative border border-warning bg-warning-muted px-4 py-3">
      <CornerTicks />
      <h3 className="flex items-center gap-2 tx-h3 text-text">
        <Icon name="alertTriangle" size={20} className="text-warning" />
        Some content is not cited — check flagged lines
      </h3>
      <p className="mt-1 tx-body text-text">
        The answer is shown in full. Lines below were not found in the cited passages.
      </p>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tx-label text-text underline"
        >
          {open ? "Hide flagged details" : "Show flagged details"}
        </button>
        {open ? (
          <ul className="mt-1 space-y-1">
            {flags.map((r, i) => (
              <li key={i} className="tx-mono text-text">
                {r}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function ErrorPanel({
  cause,
  detail,
  onRetry,
  retrievalDone,
}: {
  cause: string;
  detail?: string;
  onRetry: () => void;
  retrievalDone: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-label="Could not answer" role="alert" className="chamfer-md-clip chamfer-focus relative border border-error bg-error-muted px-4 py-3">
      <CornerTicks />
      <h3 className="flex items-center gap-2 tx-h3 text-text">
        <Icon name="alertCircle" size={20} className="text-error" />
        Could not answer
      </h3>
      <p className="mt-1 tx-body text-text">{cause}</p>
      {retrievalDone ? (
        <p className="mt-1 tx-body text-text">Retrieval completed. Writing the answer failed.</p>
      ) : null}
      {detail ? (
        <p className="mt-2 flex items-center gap-2 tx-mono text-text-secondary">
          <span className="truncate">{detail}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(detail);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 rounded-sm border border-border-strong px-1 py-0.5 tx-caption text-text hover:bg-surface-hover"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </p>
      ) : null}
      <div className="mt-3">
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </section>
  );
}

/* Density ---------------------------------------------------------------- */

export type Density = "compact" | "comfortable";

export function useDensity(key: string): [Density, () => void] {
  const [density, setDensity] = useState<Density>("compact");
  useEffect(() => {
    try {
      const v = localStorage.getItem(`rag-density-${key}`);
      if (v === "comfortable" || v === "compact") setDensity(v);
    } catch {}
  }, [key]);
  const toggle = () => {
    setDensity((d) => {
      const next = d === "compact" ? "comfortable" : "compact";
      try {
        localStorage.setItem(`rag-density-${key}`, next);
      } catch {}
      return next;
    });
  };
  return [density, toggle];
}

export function densityRow(d: Density): string {
  return d === "comfortable" ? "row-comfortable" : "row-compact";
}

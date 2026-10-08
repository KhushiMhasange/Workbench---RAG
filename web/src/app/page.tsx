"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askStream } from "@/lib/api";
import { useDocuments } from "@/components/use-rag";
import { useBreadcrumb, useWorkspaceCtx } from "@/components/shell";
import {
  ErrorPanel,
  GatedPanel,
  GuardWarningPanel,
  PipelineRail,
  QueryInput,
  RetrievalTrace,
  SourceRow,
  Chunk,
  ContextViewer,
  toPassages,
  type Passage,
  type RailStage,
} from "@/components/rag";
import { AnswerText } from "@/components/answer-text";
import { Badge, Button, Drawer, EmptyState, IconButton, Skeleton } from "@/components/ui";

type Outcome = "answered" | "gated" | "withheld" | "error" | "pending";

type Turn = {
  id: number;
  question: string;
  answer: string;
  passages: Passage[];
  citations: number[];
  outcome: Outcome;
  refusalReason: string | null;
  guardReasons: string[];
  latencyMs: number | null;
  error: string | null;
  topK: number;
  startedAt: number;
  activeRank: number | null;
};

type HistoryItem = {
  id: number;
  question: string;
  outcome: Outcome;
  workspace: string;
  at: number;
};

const OUTCOME_META: Record<Exclude<Outcome, "pending">, { label: string; icon: "checkCircle" | "searchMinus" | "shield" | "alertCircle"; tone: "positive" | "info" | "caution" | "critical" }> = {
  answered: { label: "Answered", icon: "checkCircle", tone: "positive" },
  gated: { label: "Gated", icon: "searchMinus", tone: "info" },
  withheld: { label: "Withheld", icon: "shield", tone: "caution" },
  error: { label: "Error", icon: "alertCircle", tone: "critical" },
};

let nextId = 1;

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem("rag-history") ?? "[]");
  } catch {
    return [];
  }
}

export default function AskPage() {
  const { workspace } = useWorkspaceCtx();
  const { docs, selected, setSelected } = useDocuments(workspace);
  useBreadcrumb([
    { label: workspace, href: "/sources" },
    { label: "Ask" },
  ]);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(4);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const answerRefs = useRef<Record<number, HTMLElement | null>>({});
  const traceRefs = useRef<Record<number, HTMLElement | null>>({});
  const scopeRef = useRef<HTMLDivElement | null>(null);

  const readyDocs = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);
  const busy = turns.some((t) => t.outcome === "pending");
  const hasPassages = turns.some((t) => t.passages.length > 0);
  const showEvidence = panelOpen && hasPassages;

  useEffect(() => {
    setTurns([]);
    setPanelOpen(false);
  }, [workspace]);

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("ask-doc");
      if (id && readyDocs.some((d) => d.doc_id === id)) {
        setSelected([id]);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
  }, [readyDocs, setSelected]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!scopeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [scopeOpen ]);

  const pushHistory = useCallback((item: HistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 50);
      try {
        localStorage.setItem("rag-history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const patch = useCallback((id: number, changes: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !readyDocs.length) return;
      const id = nextId++;
      const startedAt = Date.now();
      setTurns((prev) => [
        ...prev,
        {
          id, question: trimmed, answer: "", passages: [], citations: [],
          outcome: "pending", refusalReason: null, guardReasons: [],
          latencyMs: null, error: null, topK, startedAt, activeRank: null,
        },
      ]);
      setQuestion("");
      setAnnounce("Answer started. Searching your documents.");
      const controller = new AbortController();
      abortRef.current = controller;
      void askStream(
        trimmed,
        workspace,
        {
          onSources: (sources) => {
            patch(id, { passages: toPassages(sources) });
            setPanelOpen(true);
            try {
              if (window.innerWidth >= 1024) localStorage.setItem("rag-panel", "open");
            } catch {}
          },
          onToken: (token) =>
            setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, answer: t.answer + token } : t))),
          onDone: (summary) => {
            const withheldByServer =
              summary.abstained && (summary.refusal_reason === "guard" || summary.guarded);
            if (withheldByServer) {
              // Stale backend replaced the draft with the abstention prefix.
              // Keep the streamed draft text and show it with a warning instead.
              setTurns((prev) =>
                prev.map((t) => {
                  if (t.id !== id) return t;
                  const cited = [...t.answer.matchAll(/\[(\d+)\]/g)]
                    .map((m) => Number(m[1]))
                    .filter(
                      (n, idx, arr) =>
                        Number.isInteger(n) && n >= 1 && n <= t.passages.length && arr.indexOf(n) === idx,
                    );
                  return {
                    ...t,
                    answer: t.answer || summary.answer,
                    citations: cited.length ? cited : t.citations,
                    outcome: "answered" as Outcome,
                    refusalReason: null,
                    guardReasons: summary.guard_reasons?.length
                      ? summary.guard_reasons
                      : ["claim_not_in_cited_passage"],
                    latencyMs: summary.latency_ms,
                  };
                }),
              );
              setAnnounce("Answer complete.");
              pushHistory({ id, question: trimmed, outcome: "answered", workspace, at: startedAt });
              return;
            }
            const outcome: Outcome = summary.abstained ? "gated" : "answered";
            patch(id, {
              answer: summary.answer,
              citations: summary.citations,
              outcome,
              refusalReason: summary.refusal_reason ?? null,
              guardReasons: summary.guard_reasons ?? [],
              latencyMs: summary.latency_ms,
            });
            setAnnounce(outcome === "answered" ? "Answer complete." : `Request ${outcome}.`);
            pushHistory({ id, question: trimmed, outcome, workspace, at: startedAt });
          },
          onError: (error) => {
            if ((error as Error).name === "AbortError") {
              patch(id, { outcome: "error", error: "Stopped by user." });
              return;
            }
            patch(id, { outcome: "error", error: error.message, answer: "The request failed before the answer arrived." });
            setAnnounce("Answer failed.");
          },
        },
        selected.length ? selected : undefined,
        controller.signal,
        topK,
      ).finally(() => {
        abortRef.current = null;
      });
    },
    [busy, patch, workspace, selected, topK, readyDocs.length, pushHistory],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const copyText = useCallback((text: string, id: number) => {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    setAnnounce("Copied.");
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }, []);

  const scopeLine = selected.length
    ? `Scope: ${selected.length} of ${readyDocs.length} documents`
    : `Scope: all documents in ${workspace}`;

  const openCitation = useCallback(
    (turnId: number, rank: number) => {
      patch(turnId, { activeRank: rank });
      setPanelOpen(true);
    },
    [patch],
  );

  return (
    <div className="space-y-8">
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <header className="flex items-center justify-between gap-2">
        <h1 className="tx-display">Ask</h1>
        <div className="flex items-center gap-2">
          {!showEvidence && hasPassages ? (
            <Button
              variant="secondary"
              size="md"
              icon="search"
              onClick={() => setPanelOpen(true)}
              className="hidden xl:inline-flex"
            >
              Evidence
            </Button>
          ) : null}
          <Button variant="ghost" size="md" icon="history" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
        </div>
      </header>

      {!readyDocs.length ? (
        <EmptyState
          icon="search"
          heading="Nothing to search yet"
          body="Add documents in Corpus before asking questions."
          actions={
            <Button variant="primary" size="md" onClick={() => (window.location.href = "/sources")}>
              Go to Corpus
            </Button>
          }
        />
      ) : turns.length === 0 ? (
        <EmptyState
          icon="ask"
          heading="Ask your documents"
          body="Answers cite the passages they come from. Select a citation to see the evidence."
          actions={
            <>
              {readyDocs.slice(0, 3).map((d) => (
                <button
                  key={d.doc_id}
                  type="button"
                  onClick={() => send(`What does ${d.filename} cover?`)}
                  className="rounded-sm border border-border bg-surface px-3 tx-body text-text-secondary hover:border-border-strong hover:text-text"
                >
                  What does {d.filename} cover?
                </button>
              ))}
            </>
          }
        />
      ) : null}

      <div className={showEvidence ? "grid gap-6 xl:grid-cols-[minmax(0,760px)_400px] xl:justify-center" : "grid grid-cols-1 justify-items-center gap-6"}>
        <div className="min-w-0 w-full max-w-[760px]">
          <ol className="space-y-8">
            {turns.map((turn) => {
              const hasGuardWarning =
                turn.guardReasons.some((r) => r.includes("claim_not_in_cited_passage")) ||
                (turn.outcome === "answered" && turn.guardReasons.length > 0);
              const rail: RailStage[] =
                turn.outcome === "pending"
                  ? [
                      { id: "q", label: "Question", state: "complete" },
                      { id: "r", label: "Retrieval", state: turn.passages.length ? "complete" : "active", count: turn.passages.length ? `${turn.passages.length} passages` : "Searching your documents" },
                      { id: "a", label: "Answer", state: turn.passages.length ? "active" : "pending", hint: turn.answer ? undefined : "Writing answer" },
                    ]
                  : [
                      { id: "q", label: "Question", state: "complete" },
                      {
                        id: "r", label: "Retrieval", state: "complete",
                        count: `${turn.passages.length} of top ${turn.topK}`,
                      },
                      {
                        id: "a", label: "Answer",
                        state: turn.outcome === "answered" ? (hasGuardWarning ? "attention" : "complete") : turn.outcome === "withheld" ? "attention" : turn.outcome === "error" ? "failed" : "skipped",
                        hint: turn.outcome === "gated" ? "Skipped by the gate" : turn.outcome === "withheld" ? "Shown with warning — check flagged lines" : hasGuardWarning ? "Some content is not cited — check flagged lines" : undefined,
                      },
                    ];
              const cited = turn.passages.filter((p) => turn.citations.includes(p.rank));
              const uncited = turn.passages.filter((p) => !turn.citations.includes(p.rank));
              const best = turn.passages.length ? Math.max(...turn.passages.map((p) => p.score ?? 0)) : null;
              return (
                <li key={turn.id}>
                  <article aria-labelledby={`q-${turn.id}`}>
                    <PipelineRail
                      stages={rail}
                      compact={turn.outcome !== "pending"}
                      ariaLabel={`Pipeline for question ${turn.id}`}
                      onSelect={(id) => {
                        if (id === "r") traceRefs.current[turn.id]?.scrollIntoView({ block: "nearest" });
                        else answerRefs.current[turn.id]?.scrollIntoView({ block: "nearest" });
                      }}
                    />
                    <p className="mt-3 tx-caption text-text-muted">You</p>
                    <h2 id={`q-${turn.id}`} className="tx-h3">
                      {turn.question}
                    </h2>

                    <div className="mt-3 space-y-3">
                      {turn.outcome === "pending" && !turn.answer ? (
                        <div className="space-y-2" aria-label="Loading answer">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      ) : null}

                      {turn.answer && turn.outcome !== "gated" && turn.outcome !== "error" ? (
                        <section
                          aria-label="Answer"
                          ref={(el) => {
                            answerRefs.current[turn.id] = el;
                          }}
                        >
                          <AnswerText
                            text={turn.answer}
                            citedRanks={turn.citations}
                            passages={turn.passages}
                            activeRank={turn.activeRank}
                            onOpenCitation={(rank) => openCitation(turn.id, rank)}
                            streaming={turn.outcome === "pending"}
                          />
                          {hasGuardWarning || turn.outcome === "withheld" ? (
                            <div className="mt-3">
                              <GuardWarningPanel reasons={turn.guardReasons} />
                            </div>
                          ) : null}
                          {turn.outcome === "answered" || turn.outcome === "withheld" ? (
                            <>
                              <div className="mt-2 flex gap-1" role="group" aria-label="Answer actions">
                                <IconButton
                                  label={copied === turn.id ? "Copied" : "Copy answer"}
                                  icon={copied === turn.id ? "check" : "copy"}
                                  size={28}
                                  onClick={() => copyText(turn.answer, turn.id)}
                                />
                                <IconButton
                                  label="Copy answer with sources"
                                  icon="copy"
                                  size={28}
                                  onClick={() =>
                                    copyText(
                                      `${turn.answer}\n\nSources:\n${cited.map((p) => `[${p.rank}] ${p.filename}${p.page ? `, p. ${p.page}` : ""}`).join("\n")}`,
                                      turn.id + 1000000,
                                    )
                                  }
                                />
                                <IconButton label="Ask again" icon="refresh" size={28} onClick={() => send(turn.question)} />
                              </div>
                              <h3 className="mt-3 tx-label text-text-secondary">
                                Sources ({cited.length})
                              </h3>
                              <ul className="mt-1 rounded-sm border border-border">
                                {cited.map((p) => (
                                  <SourceRow
                                    key={p.key}
                                    rank={p.rank}
                                    filename={p.filename}
                                    location={[p.page != null ? `p. ${p.page}` : null, p.heading].filter(Boolean).join(", ")}
                                    score={p.score}
                                    cited
                                    selected={turn.activeRank === p.rank}
                                    onSelect={() => openCitation(turn.id, p.rank)}
                                    onOpen={() => (window.location.href = `/sources/${encodeURIComponent(p.docId)}?chunk=${encodeURIComponent(p.chunkId)}`)}
                                  />
                                ))}
                              </ul>
                            </>
                          ) : null}
                        </section>
                      ) : null}

                      {turn.outcome === "gated" ? (
                        <GatedPanel
                          best={best}
                          passages={turn.passages}
                          onOpenCorpus={() => (window.location.href = "/sources")}
                        />
                      ) : null}
                      {turn.outcome === "error" ? (
                        <ErrorPanel
                          cause={turn.error === "Stopped by user." ? "Stopped by user." : "The language model did not respond"}
                          detail={turn.error && turn.error !== "Stopped by user." ? turn.error : undefined}
                          onRetry={() => send(turn.question)}
                          retrievalDone={turn.passages.length > 0}
                        />
                      ) : null}

                      {turn.outcome !== "pending" ? (
                        <div ref={(el) => { traceRefs.current[turn.id] = el; }}>
                          <RetrievalTrace kept={turn.passages.length} best={best} latencyMs={turn.latencyMs} />
                        </div>
                      ) : null}

                      {turn.outcome === "pending" && uncited.length ? (
                        <p className="tx-caption text-text-muted">
                          Writing answer from {turn.passages.length} passages
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>

          <div className="sticky bottom-0 mt-6 bg-bg py-3">
            <QueryInput
              value={question}
              onChange={setQuestion}
              onSubmit={() => send(question)}
              onStop={stop}
              submitting={busy}
              disabled={!readyDocs.length}
              disabledHint={readyDocs.length ? undefined : "Add documents in Corpus before asking questions."}
              scopeLine={scopeLine}
              onScopeClick={() => setScopeOpen((v) => !v)}
              topK={topK}
              onTopK={setTopK}
            />
            {scopeOpen ? (
              <div ref={scopeRef} role="dialog" aria-label="Question scope" className="chamfer-md-clip chamfer-focus mt-2 border border-border bg-surface-elevated p-3 shadow-[var(--shadow-popover)]">
                <p className="tx-label text-text-secondary">Ask within selected documents, or all documents when none are selected.</p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {readyDocs.map((d) => (
                    <li key={d.doc_id}>
                      <label className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 hover:bg-surface-hover">
                        <input
                          type="checkbox"
                          checked={selected.includes(d.doc_id)}
                          onChange={(e) =>
                            setSelected(e.target.checked ? [...selected, d.doc_id] : selected.filter((x) => x !== d.doc_id))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate tx-body text-text">{d.filename}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                    Clear selection
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setScopeOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <EvidencePanel
          turns={turns}
          open={showEvidence}
          onToggle={() => {
            setPanelOpen((v) => {
              try {
                localStorage.setItem("rag-panel", v ? "closed" : "open");
              } catch {}
              return !v;
            });
          }}
        />
      </div>

      <Drawer title="History" open={historyOpen} onClose={() => setHistoryOpen(false)}>
        {history.length ? (
          <ul className="space-y-1">
            {history.map((h) => {
              const meta = OUTCOME_META[h.outcome as Exclude<Outcome, "pending">] ?? OUTCOME_META.error;
              return (
                <li key={`${h.id}-${h.at}`}>
                  <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2">
                    <Badge tone={meta.tone} icon={meta.icon}>
                      {meta.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate tx-body text-text">{h.question}</p>
                      <p className="tx-mono-sm text-text-muted">
                        {h.workspace} · {new Date(h.at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="tx-body text-text-secondary">No questions asked yet in this browser.</p>
        )}
      </Drawer>
    </div>
  );
}

function EvidencePanel({ turns, open, onToggle }: { turns: Turn[]; open: boolean; onToggle: () => void }) {
  const last = [...turns].reverse().find((t) => t.passages.length);
  const [viewer, setViewer] = useState<number | null>(null);
  useEffect(() => {
    setViewer(null);
  }, [last?.id]);
  const active = last?.passages.find((p) => p.rank === (last.activeRank ?? viewer)) ?? null;
  const cited = (last?.passages ?? []).filter((p) => (last?.citations ?? []).includes(p.rank));
  const uncited = (last?.passages ?? []).filter((p) => !(last?.citations ?? []).includes(p.rank));

  const body = !last ? (
    <p className="tx-body text-text-muted">Sources appear here as soon as you ask a question.</p>
  ) : (
    <div className="space-y-4">
      <section aria-label="Retrieval trace">
        <h3 className="tx-label text-text-secondary">Retrieval trace</h3>
        <div className="mt-1">
          <RetrievalTrace
            kept={last.passages.length}
            best={last.passages.length ? Math.max(...last.passages.map((p) => p.score ?? 0)) : null}
            latencyMs={last.latencyMs}
          />
        </div>
      </section>
      <section aria-label="Cited passages">
        <h3 className="tx-label text-text-secondary">Cited ({cited.length})</h3>
        <ul className="mt-1 space-y-1">
          {cited.map((p) => (
            <li key={p.key}>
              <Chunk passage={p} role="cited" selected={(last.activeRank ?? viewer) === p.rank} onSelect={() => setViewer(p.rank)} />
            </li>
          ))}
          {!cited.length ? <li className="tx-body text-text-muted">No sources used.</li> : null}
        </ul>
      </section>
      {uncited.length ? (
        <section aria-label="Retrieved but not cited">
          <h3 className="tx-label text-text-secondary">Retrieved but not cited ({uncited.length})</h3>
          <ul className="mt-1 space-y-1">
            {uncited.map((p) => (
              <li key={p.key}>
                <Chunk passage={p} role="retrieved" selected={(last.activeRank ?? viewer) === p.rank} onSelect={() => setViewer(p.rank)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {active ? (
        <ContextViewer
          passage={active}
          position={last.passages.findIndex((p) => p.rank === active.rank)}
          total={last.passages.length}
          onPrev={() => {
            const i = last.passages.findIndex((p) => p.rank === active.rank);
            if (i > 0) setViewer(last.passages[i - 1].rank);
          }}
          onNext={() => {
            const i = last.passages.findIndex((p) => p.rank === active.rank);
            if (i < last.passages.length - 1) setViewer(last.passages[i + 1].rank);
          }}
          onOpenInCorpus={() => (window.location.href = `/sources/${encodeURIComponent(active.docId)}?chunk=${encodeURIComponent(active.chunkId)}`)}
        />
      ) : null}
    </div>
  );

  if (!open) {
    return (
      <div className="xl:hidden">
        <Button variant="secondary" size="md" onClick={onToggle} icon="search">
          {last ? `Evidence (${last.passages.length})` : "Evidence"}
        </Button>
        <Drawer title="Evidence" open={open} onClose={onToggle}>
          {body}
        </Drawer>
      </div>
    );
  }
  return (
    <>
      <aside aria-label="Evidence" className="hidden xl:block">
        <div className="sticky top-16 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-slim">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="tx-label text-text-secondary">Evidence</h2>
            <button type="button" onClick={onToggle} className="tx-caption text-text-muted underline hover:text-text">
              Collapse
            </button>
          </div>
          {body}
        </div>
      </aside>
      <div className="xl:hidden">
        <Button variant="secondary" size="md" onClick={onToggle} icon="search">
          {last ? `Evidence (${last.passages.length})` : "Evidence"}
        </Button>
        <Drawer title="Evidence" open={open} onClose={onToggle}>
          {body}
        </Drawer>
      </div>
    </>
  );
}

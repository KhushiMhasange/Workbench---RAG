"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getEvalSummary } from "@/lib/api";
import { useBreadcrumb } from "@/components/shell";
import { EvaluationScore, MetricCard, PipelineRail, type RailStage } from "@/components/rag";
import { Button, Dialog, EmptyState, Skeleton, Tabs } from "@/components/ui";


type Tab = "runs" | "dataset" | "compare";

type MetricDef = {
  key: string;
  name: string;
  kind: "rate" | "duration" | "count";
  direction: "higher" | "lower" | "neutral";
  unit?: string;
  description: string;
};

const KNOWN: Record<string, Omit<MetricDef, "key">> = {
  "recall@k": { name: "Recall at k", kind: "rate", direction: "higher", description: "Share of expected passages retrieved in the top k." },
  mrr: { name: "Mean reciprocal rank", kind: "rate", direction: "higher", description: "Average of one over the rank of the first expected passage." },
  "hit@1": { name: "Hit at 1", kind: "rate", direction: "higher", description: "Share of questions whose top passage was expected." },
  "hit@k": { name: "Hit at k", kind: "rate", direction: "higher", description: "Share of questions with an expected passage in the top k." },
  false_refusal_rate: { name: "False refusal rate", kind: "rate", direction: "lower", description: "Share of answerable questions the system refused." },
  abstain_precision: { name: "Abstention precision", kind: "rate", direction: "higher", description: "Share of refusals that were correct." },
  abstain_recall: { name: "Abstention recall", kind: "rate", direction: "higher", description: "Share of unanswerable questions the system refused." },
  citation_validity: { name: "Citation validity", kind: "rate", direction: "higher", description: "Share of citations that point at a shown passage." },
  faithfulness: { name: "Faithfulness", kind: "rate", direction: "higher", description: "Share of answered cases whose claims are supported by cited passages." },
  latency_p50: { name: "Latency p50", kind: "duration", direction: "lower", unit: "ms", description: "Median end-to-end latency per case." },
  latency_p95: { name: "Latency p95", kind: "duration", direction: "lower", unit: "ms", description: "95th percentile end-to-end latency per case." },
};

function defFor(key: string): MetricDef {
  const k = KNOWN[key];
  if (k) return { key, ...k };
  return {
    key,
    name: key.replace(/_/g, " ").replace(/@k$/, " at k"),
    kind: "rate",
    direction: "neutral",
    description: "Reported by the evaluation harness. No definition supplied.",
  };
}

function formatValue(key: string, v: unknown): string {
  const d = defFor(key);
  if (typeof v !== "number") return String(v ?? "–");
  if (d.kind === "rate") return `${(v * 100).toFixed(1)}%`;
  if (d.kind === "duration") return String(Math.round(v));
  return String(v);
}

type Summary = Record<string, number | string | Record<string, number>>;

function MetricGrid({ summary, n }: { summary: Summary; n: number }) {
  const [selected, setSelected] = useState<string>("recall@k");
  const keys = useMemo(
    () => Object.keys(summary).filter((k) => typeof summary[k] === "number" && k !== "n"),
    [summary],
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {keys.map((k) => {
          const d = defFor(k);
          return (
            <MetricCard
              key={k}
              name={d.name}
              info={d.description}
              value={formatValue(k, summary[k])}
              unit={d.kind === "duration" ? d.unit : undefined}
              sampleSize={`n = ${n}`}
              thresholdNote={n < 30 ? "Small sample: differences may not be meaningful." : undefined}
              selected={selected === k}
              onSelect={() => setSelected(k)}
            />
          );
        })}
      </div>
      {selected ? (
        <section aria-label={`${defFor(selected).name} by suite`}>
          <h3 className="tx-h3">{defFor(selected).name} by suite</h3>
          <SuiteBars metric={selected} />
        </section>
      ) : null}
    </div>
  );
}

function SuiteBars({ metric }: { metric: string }) {
  const [data, setData] = useState<{ name: string; value: number }[] | null>(null);
  useEffect(() => {
    getEvalSummary()
      .then((s) => {
        const suites = (s.suites ?? {}) as Record<string, Record<string, number>>;
        setData(Object.entries(suites).map(([name, m]) => ({ name, value: Number(m[metric] ?? 0) })));
      })
      .catch(() => setData([]));
  }, [metric]);
  if (!data) return <Skeleton className="h-24" />;
  if (!data.length) return <p className="tx-body text-text-muted">No suite data for this metric.</p>;
  const d = defFor(metric);
  const max = d.kind === "rate" ? 1 : Math.max(...data.map((x) => x.value), 1);
  return (
    <div className="space-y-2" role="img" aria-label={`${d.name} by suite: ${data.map((x) => `${x.name} ${formatValue(metric, x.value)}`).join(", ")}`}>
      {data.map((x, i) => (
        <div key={x.name} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate tx-mono-sm text-text-secondary">{x.name}</span>
          <span className="h-4 flex-1 rounded-xs bg-border" aria-hidden="true">
            <span
              className="block h-full rounded-xs"
              style={{
                width: `${(x.value / max) * 100}%`,
                backgroundColor: i === 0 ? "var(--color-chart-1)" : "var(--color-chart-2)",
              }}
            />
          </span>
          <span className="w-16 shrink-0 text-right tx-mono-sm text-text tabular">{formatValue(metric, x.value)}</span>
        </div>
      ))}
      <table className="sr-only">
        <tbody>
          {data.map((x) => (
            <tr key={x.name}>
              <th>{x.name}</th>
              <td>{formatValue(metric, x.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunsTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [meta, setMeta] = useState<Record<string, string> | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    getEvalSummary()
      .then((s) => {
        if (!s.available) {
          setError(s.hint ?? "No evaluation report yet.");
          return;
        }
        setSummary((s.summary ?? {}) as Summary);
        setMeta((s.meta ?? {}) as Record<string, string>);
        setConfig((s.config ?? {}) as Record<string, unknown>);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) {
    return (
      <EmptyState
        icon="measurements"
        heading="No evaluation runs yet"
        body={`${error} Run your golden dataset to see how retrieval and answers perform.`}
      />
    );
  }
  if (!summary) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading metrics">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }
  const n = Number(summary.n ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="tx-body text-text-secondary">
          Latest report{meta?.generated_at ? ` · ${meta.generated_at}` : ""} · run history is not exposed by the server, showing the latest report only.
        </p>
        <span className="ml-auto">
          <Button variant="primary" size="md" icon="play" onClick={() => setDialog(true)}>
            Run evaluation
          </Button>
        </span>
      </div>
      <MetricGrid summary={summary} n={n} />
      {config ? (
        <section aria-label="Run configuration">
          <h3 className="tx-h3">Configuration</h3>
          <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(config).map(([k, v]) => (
              <div key={k} className="rounded-sm border border-border bg-surface px-3 py-2">
                <dt className="tx-mono-sm text-text-muted">{k}</dt>
                <dd className="tx-mono text-text">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <Dialog open={dialog} onClose={() => setDialog(false)} title="Run evaluation">
        <p className="tx-body text-text">
          Evaluation runs are started from the command line. Run <span className="tx-mono">python -m rag.cli eval run</span> in the repository root, then return here to see the new report.
        </p>
      </Dialog>
    </div>
  );
}

function DatasetTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    getEvalSummary()
      .then((s) => setSummary((s.summary ?? {}) as Summary))
      .catch(() => setSummary({}));
  }, []);
  const n = Number(summary?.n ?? 0);
  return (
    <div className="space-y-4">
      <p className="tx-body text-text-secondary">
        {n ? `${n} cases in the latest report.` : "Case counts will appear here once a report exists."} The golden dataset itself (questions, expected answers, tags) is not exposed by the server, so this tab is read-only summary counts.
      </p>
      <div className="h-2 w-full overflow-hidden rounded-xs bg-border" aria-hidden="true">
        <div className="h-full bg-info" style={{ width: "100%" }} />
      </div>
      <p className="tx-caption text-text-muted">Answerable versus unanswerable split is not reported separately. Refusal behaviour cannot be judged per split from this view.</p>
    </div>
  );
}

function CompareTab() {
  const [suites, setSuites] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    getEvalSummary()
      .then((s) => setSuites((s.suites ?? {}) as Record<string, Record<string, number>>))
      .catch(() => setSuites({}));
  }, []);
  const names = Object.keys(suites);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  useEffect(() => {
    if (names.length >= 2 && !a) {
      setA(names[0]);
      setB(names[1]);
    }
  }, [names.join(","), a]);
  if (names.length < 2) {
    return <p className="tx-body text-text-muted">Two suites are needed to compare. The current report has {names.length}.</p>;
  }
  const keys = [...new Set([...Object.keys(suites[a] ?? {}), ...Object.keys(suites[b] ?? {})])].filter(
    (k) => typeof suites[a]?.[k] === "number" && k !== "n",
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="tx-label text-text-secondary">
          Baseline
          <select value={a} onChange={(e) => setA(e.target.value)} className="ml-2 h-8 rounded-sm border border-border-input bg-surface px-2 tx-body text-text">
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="tx-label text-text-secondary">
          Candidate
          <select value={b} onChange={(e) => setB(e.target.value)} className="ml-2 h-8 rounded-sm border border-border-input bg-surface px-2 tx-body text-text">
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="tx-body text-text-secondary">Comparing suites within the latest report. Run-to-run comparison is unavailable because run history is not exposed by the server. Per-case changes are unavailable because per-case results are not exposed.</p>
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full tx-body">
          <thead>
            <tr className="bg-surface-sunken text-left">
              <th scope="col" className="px-3 py-2 tx-label text-text-secondary">Metric</th>
              <th scope="col" className="px-3 py-2 text-right tx-label text-text-secondary">{a} (n = {suites[a]?.n})</th>
              <th scope="col" className="px-3 py-2 text-right tx-label text-text-secondary">{b} (n = {suites[b]?.n})</th>
              <th scope="col" className="px-3 py-2 text-right tx-label text-text-secondary">Delta</th>
              <th scope="col" className="px-3 py-2 tx-label text-text-secondary">Status</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const d = defFor(k);
              const va = Number(suites[a]?.[k] ?? 0);
              const vb = Number(suites[b]?.[k] ?? 0);
              const delta = vb - va;
              const improved =
                d.direction === "neutral" || Math.abs(delta) < 1e-9
                  ? "neutral"
                  : (d.direction === "higher") === delta > 0
                    ? "improvement"
                    : "regression";
              return (
                <tr key={k} className="border-b border-border bg-surface last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text" title={d.description}>{d.name}</th>
                  <td className="px-3 py-2 text-right tx-mono text-text tabular">{formatValue(k, va)}</td>
                  <td className="px-3 py-2 text-right tx-mono text-text tabular">{formatValue(k, vb)}</td>
                  <td className={`px-3 py-2 text-right tx-mono tabular ${improved === "improvement" ? "text-success" : improved === "regression" ? "text-error" : "text-text-muted"}`}>
                    {delta > 0 ? "+" : ""}{d.kind === "rate" ? `${(delta * 100).toFixed(1)}pp` : delta.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <EvaluationScore state={improved === "neutral" ? "skipped" : improved === "improvement" ? "pass" : "fail"} score={improved === "neutral" ? "Unchanged" : improved === "improvement" ? "Improved" : "Regressed"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MeasurementsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "runs";
  useBreadcrumb([{ label: "Measurements" }]);
  const rail: RailStage[] = [
    { id: "d", label: "Dataset", state: "complete", count: "golden cases" },
    { id: "e", label: "Evaluation", state: "complete", count: "latest report" },
    { id: "m", label: "Metrics", state: "complete" },
  ];
  return (
    <div className="space-y-5">
      <header>
        <h1 className="tx-display">Measurements</h1>
        <p className="mt-1 tx-body text-text-secondary">Is the system getting better, and where is it failing?</p>
      </header>
      <PipelineRail stages={rail} ariaLabel="Evaluation pipeline" />
      <Tabs<Tab>
        ariaLabel="Measurements views"
        active={tab}
        onChange={(v) => router.replace(`/evaluation?tab=${v}`)}
        tabs={[
          { value: "runs", label: "Runs" },
          { value: "dataset", label: "Dataset" },
          { value: "compare", label: "Compare" },
        ]}
      />
      {tab === "runs" ? <RunsTab /> : tab === "dataset" ? <DatasetTab /> : <CompareTab />}
    </div>
  );
}

export default function MeasurementsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <MeasurementsInner />
    </Suspense>
  );
}

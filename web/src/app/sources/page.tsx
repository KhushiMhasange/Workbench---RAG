"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { deleteDocument, getSources, search, uploadDocuments } from "@/lib/api";
import type { DocRow } from "@/lib/types";
import { useBreadcrumb, useWorkspaceCtx } from "@/components/shell";
import { useDocuments } from "@/components/use-rag";
import { useHealth } from "@/components/use-health";
import {
  Chunk,
  PipelineRail,
  ProcessingStatus,
  RetrievalScore,
  densityRow,
  useDensity,
  type RailStage,
} from "@/components/rag";
import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Notice,
  ProgressBar,
  Skeleton,
  SortHeader,
  Table,
  Tabs,
} from "@/components/ui";
import { Icon } from "@/components/icons";

type Tab = "documents" | "chunks" | "index";

const ACCEPT = ".pdf,.txt,.md,.docx,.csv";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { workspace } = useWorkspaceCtx();
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setFiles([]);
      setErrors([]);
    }
  }, [open ]);
  const send = async () => {
    if (!files.length) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await uploadDocuments(workspace, files);
      const errs = res.documents
        .filter((d) => (d as { error?: string }).error)
        .map((d) => `${d.filename}: ${(d as { error?: string }).error}`);
      setErrors(errs);
      onDone();
      if (!errs.length) onClose();
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upload documents"
      actions={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" icon="upload" onClick={() => void send()} disabled={!files.length || busy}>
            {busy ? "Uploading" : "Upload documents"}
          </Button>
        </>
      }
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles((p) => [...p, ...[...e.dataTransfer.files]]);
        }}
        className="chamfer-md-clip chamfer-focus relative border border-dashed border-border-strong p-4 text-center"
      >
        <p className="tx-body text-text">Drag files here, or</p>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          aria-label="Choose files to upload"
          className="mt-2 tx-body"
          onChange={(e) => setFiles((p) => [...p, ...[...(e.target.files ?? [])]])}
        />
        <p className="mt-2 tx-caption text-text-muted">Accepted types: {ACCEPT}. Each file is processed separately.</p>
      </div>
      {files.length ? (
        <ul className="mt-3 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex h-8 items-center gap-2 rounded-sm border border-border px-2 tx-body text-text">
              <Icon name="file" size={16} className="text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="tx-mono-sm text-text-muted">{formatSize(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-text-muted hover:text-text">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {errors.length ? (
        <ul className="mt-2 space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="tx-caption text-error">{e}</li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}

function DocumentsTab() {
  const { workspace } = useWorkspaceCtx();
  const { docs, refresh } = useDocuments(workspace);
  const router = useRouter();
  const params = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<DocRow[] | null>(null);
  const [density, toggleDensity] = useDensity("documents");
  const [sort, setSort] = useState<{ key: "name" | "chunks" | "size"; dir: "asc" | "desc" } | null>(null);

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`/sources?tab=documents&${next.toString()}`);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = docs.filter(
      (d) =>
        (!needle || d.filename.toLowerCase().includes(needle)) &&
        (status === "all" || d.status === status),
    );
    if (sort) {
      const val = (d: DocRow) =>
        sort.key === "name" ? d.filename.toLowerCase() : sort.key === "chunks" ? d.chunks : sort.key === "size" ? d.size_bytes : 0;
      rows = [...rows].sort((a, b) => {
        const c = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0;
        return sort.dir === "asc" ? c : -c;
      });
    }
    return rows;
  }, [docs, q, status, sort]);

  const processing = docs.some((d) => d.status !== "ready" && d.status !== "failed");

  const removeDocs = async (rows: DocRow[]) => {
    for (const d of rows) {
      await deleteDocument(workspace, d.doc_id).catch(() => {});
    }
    setSelected([]);
    setConfirmDelete(null);
    void refresh();
  };

  return (
    <section aria-label="Documents" className="space-y-3">
      {selected.length ? (
        <div role="status" className="flex h-10 items-center gap-2 rounded-sm border border-primary-border bg-primary-muted px-3">
          <span className="tx-body text-text">{selected.length} selected</span>
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(docs.filter((d) => selected.includes(d.doc_id)))}
            >
              Delete
            </Button>
          </span>
        </div>
      ) : (
        <div className="sticky top-12 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-bg py-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Search name"
            aria-label="Search documents by name"
            className="h-8 w-56 rounded-sm border border-border-input bg-surface px-3 tx-body text-text placeholder:text-text-muted"
          />
          <select
            value={status}
            onChange={(e) => setParam("status", e.target.value === "all" ? "" : e.target.value)}
            aria-label="Filter by status"
            className="h-8 rounded-sm border border-border-input bg-surface px-2 tx-body text-text"
          >
            {["all", "queued", "parsing", "embedding", "ready", "failed"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
          <span className="ml-auto flex items-center gap-2">
            <span className="tx-caption text-text-muted">
              {filtered.length} of {docs.length} documents
            </span>
            <button type="button" onClick={toggleDensity} className="h-8 rounded-sm border border-border px-2 tx-caption text-text-secondary hover:text-text" title="Toggle table density">
              Density: {density}
            </button>
            <Button variant="primary" size="md" icon="upload" onClick={() => setUploadOpen(true)}>
              Upload documents
            </Button>
          </span>
        </div>
      )}

      {(params.get("status") && params.get("status") !== "all") || q ? (
        <div className="flex flex-wrap items-center gap-2">
          {q ? (
            <button type="button" onClick={() => setParam("q", "")} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 tx-caption text-text">
              Search: {q} <Icon name="x" size={14} />
            </button>
          ) : null}
          {status !== "all" ? (
            <button type="button" onClick={() => setParam("status", "")} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 tx-caption text-text">
              Status: {status} <Icon name="x" size={14} />
            </button>
          ) : null}
          <button type="button" onClick={() => { setParam("q", ""); setParam("status", ""); }} className="tx-caption text-primary-text underline">
            Clear all
          </button>
        </div>
      ) : null}

      {!docs.length ? (
        <EmptyState
          icon="corpus"
          heading="No documents yet"
          body="Upload documents to build the knowledge your questions are answered from."
          actions={
            <Button variant="primary" size="md" icon="upload" onClick={() => setUploadOpen(true)}>
              Upload documents
            </Button>
          }
        />
      ) : !filtered.length ? (
        <EmptyState
          icon="search"
          heading={`No matches for "${q || status}"`}
          body="Check the spelling, remove a filter, or try a broader term."
          actions={
            <Button variant="secondary" size="md" onClick={() => { setParam("q", ""); setParam("status", ""); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Table ariaLabel="Documents">
          <thead>
            <tr className="bg-surface-sunken text-left">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all documents on this page"
                  checked={selected.length > 0 && filtered.every((d) => selected.includes(d.doc_id))}
                  onChange={(e) => setSelected(e.target.checked ? filtered.map((d) => d.doc_id) : [])}
                  className="h-4 w-4"
                />
              </th>
              <th className="px-3 py-2 tx-label text-text-secondary">
                <SortHeader label="Name" active={sort?.key === "name"} direction={sort?.key === "name" ? sort.dir : null} onSort={() => setSort((s) => (s?.key === "name" && s.dir === "asc" ? { key: "name", dir: "desc" } : { key: "name", dir: "asc" }))} />
              </th>
              <th className="px-3 py-2 tx-label text-text-secondary">Status</th>
              <th className="px-3 py-2 text-right tx-label text-text-secondary">
                <SortHeader label="Chunks" active={sort?.key === "chunks"} direction={sort?.key === "chunks" ? sort.dir : null} onSort={() => setSort((s) => (s?.key === "chunks" && s.dir === "asc" ? { key: "chunks", dir: "desc" } : { key: "chunks", dir: "asc" }))} />
              </th>
              <th className="hidden px-3 py-2 text-right tx-label text-text-secondary md:table-cell">
                <SortHeader label="Size" active={sort?.key === "size"} direction={sort?.key === "size" ? sort.dir : null} onSort={() => setSort((s) => (s?.key === "size" && s.dir === "asc" ? { key: "size", dir: "desc" } : { key: "size", dir: "asc" }))} />
              </th>
              <th className="hidden px-3 py-2 tx-label text-text-secondary lg:table-cell">Hash</th>
              <th className="w-10 px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.doc_id} className={`border-b border-border bg-surface last:border-b-0 hover:bg-surface-hover ${densityRow(density)} ${selected.includes(d.doc_id) ? "bg-primary-muted" : ""}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.filename}`}
                    checked={selected.includes(d.doc_id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, d.doc_id] : selected.filter((x) => x !== d.doc_id))}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/sources/${encodeURIComponent(d.doc_id)}`} className="flex items-center gap-2 text-primary-text underline hover:text-primary">
                    <Icon name="file" size={16} className="shrink-0 text-text-muted" />
                    <span className="truncate tx-body" title={d.filename}>{d.filename}</span>
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <ProcessingStatus status={d.status} error={d.error} />
                  {d.status !== "ready" && d.status !== "failed" ? (
                    <span className="mt-1 block w-24"><ProgressBar label={`${d.filename} processing`} /></span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tx-mono text-text tabular">{d.chunks}</td>
                <td className="hidden px-3 py-2 text-right tx-body text-text-secondary md:table-cell">{formatSize(d.size_bytes)}</td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  <CopyHash hash={d.doc_id} />
                </td>
                <td className="px-3 py-2">
                  <IconButton label={`Delete ${d.filename}`} icon="trash" size={28} onClick={() => setConfirmDelete([d])} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {processing ? (
        <p role="status" className="tx-caption text-text-muted">Still working. Large documents can take a minute. The list refreshes automatically.</p>
      ) : null}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={() => void refresh()} />

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Delete documents"
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructiveFill" size="md" onClick={() => void removeDocs(confirmDelete ?? [])}>
              Delete {(confirmDelete ?? []).length} document{(confirmDelete ?? []).length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        {(confirmDelete ?? []).map((d) => (
          <p key={d.doc_id} className="tx-body text-text">
            Delete <strong>{d.filename}</strong> and its {d.chunks} chunks? This cannot be undone.
          </p>
        ))}
      </Dialog>
    </section>
  );
}

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={hash}
      onClick={() => {
        void navigator.clipboard?.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="tx-mono-sm text-text-muted tabular hover:text-text"
    >
      {copied ? "Copied" : hash.slice(0, 8)}
    </button>
  );
}

function ChunksTab() {
  const { workspace } = useWorkspaceCtx();
  const [mode, setMode] = useState<"text" | "semantic">("text");
  const [q, setQ] = useState("");
  const [chunks, setChunks] = useState<{ chunk_id: string; doc_id: string; filename: string; page: number | null; text: string; id: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [density, toggleDensity] = useDensity("chunks");

  useEffect(() => {
    setChunks(null);
    setError(null);
    getSources(workspace, 200)
      .then((d) => setChunks(d.chunks as { chunk_id: string; doc_id: string; filename: string; page: number | null; text: string; id: string }[]))
      .catch((e: Error) => setError(e.message));
  }, [workspace]);

  const runSemantic = async (query: string) => {
    if (!query.trim()) {
      setScores({});
      return;
    }
    try {
      const res = await search(query, workspace);
      const map: Record<string, number> = {};
      for (const r of res.results) map[r.chunk_id] = r.score;
      setScores(map);
    } catch {
      setScores({});
    }
  };

  const filtered = useMemo(() => {
    if (!chunks) return [];
    const needle = q.trim().toLowerCase();
    let rows = needle && mode === "text" ? chunks.filter((c) => c.text.toLowerCase().includes(needle)) : chunks;
    if (mode === "semantic" && Object.keys(scores).length) {
      rows = [...rows].sort((a, b) => (scores[b.chunk_id] ?? -1) - (scores[a.chunk_id] ?? -1));
    }
    return rows;
  }, [chunks, q, mode, scores]);

  if (error) {
    return (
      <Notice tone="critical" title="Could not load chunks" role="alert">
        {error}
      </Notice>
    );
  }

  return (
    <section aria-label="Chunks" className="space-y-3">
      <div className="sticky top-12 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-bg py-2">
        <div role="group" aria-label="Chunk search mode" className="inline-flex rounded-sm border border-border p-0.5">
          {(["text", "semantic"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`h-7 rounded-sm px-3 tx-label ${mode === m ? "bg-primary-muted text-text" : "text-text-secondary hover:text-text"}`}
            >
              {m === "text" ? "Text" : "Semantic"}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (mode === "semantic") void runSemantic(e.target.value);
          }}
          placeholder={mode === "text" ? "Filter passages" : "Run the retriever"}
          aria-label={mode === "text" ? "Filter passages by text" : "Search passages semantically"}
          className="h-8 w-64 rounded-sm border border-border-input bg-surface px-3 tx-body text-text placeholder:text-text-muted"
        />
        <span className="ml-auto flex items-center gap-2">
          <span className="tx-caption text-text-muted tabular">{filtered.length} passages</span>
          <button type="button" onClick={toggleDensity} className="h-8 rounded-sm border border-border px-2 tx-caption text-text-secondary hover:text-text" title="Toggle table density">
            Density: {density}
          </button>
        </span>
      </div>
      {!chunks ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !filtered.length ? (
        <EmptyState icon="search" heading={`No matches for "${q}"`} body="Check the spelling or try a broader term." />
      ) : (
        <ul className="space-y-1">
          {filtered.slice(0, 50).map((c) => (
            <li key={c.chunk_id}>
              <Chunk
                passage={{ key: c.chunk_id, rank: 0, chunkId: c.chunk_id, docId: c.doc_id, filename: c.filename, page: c.page, heading: null, text: c.text, score: scores[c.chunk_id] ?? null }}
                selected={selected === c.chunk_id}
                onSelect={() => setSelected((s) => (s === c.chunk_id ? null : c.chunk_id))}
              />
              {mode === "semantic" && scores[c.chunk_id] != null ? (
                <span className="ml-1"><RetrievalScore score={scores[c.chunk_id]} compact /></span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 50 ? (
        <p className="tx-caption text-text-muted">Showing 50 of {filtered.length}. Narrow the search to see more.</p>
      ) : null}
    </section>
  );
}

function IndexTab() {
  const { workspace } = useWorkspaceCtx();
  const { health } = useHealth();
  const { docs } = useDocuments(workspace);
  const stale = docs.filter((d) => d.status === "ready" && health && d.embedding_model && d.embedding_model !== health.embedding_model);
  return (
    <section aria-label="Index" className="max-w-[720px] space-y-4">
      <p className="tx-body text-text-secondary">
        Each chunk is stored with two representations: a meaning vector for semantic search and a keyword vector for exact-term search. Searches run both and merge the results.
      </p>
      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            ["Embedding model", health?.embedding_model ?? "–", true],
            ["Language model", health?.language_model ?? "–", true],
            ["Vector store", health?.qdrant === true ? "reachable" : String(health?.qdrant ?? "–"), false],
            ["Points in default workspace", String(health?.qdrant_points_default ?? "–"), false],
          ] as [string, string, boolean][]
        ).map(([k, v, mono]) => (
          <div key={k} className="rounded-sm border border-border bg-surface px-3 py-2">
            <dt className="tx-caption text-text-muted">{k}</dt>
            <dd className={`truncate ${mono ? "tx-mono text-text" : "tx-body text-text"}`} title={String(v)}>{String(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="tx-caption text-text-muted">Collection internals such as the collection name, vector dimension and BM25 language are not exposed by the server.</p>
      {stale.length ? (
        <Notice tone="caution" title={`${stale.length} document${stale.length === 1 ? " was" : "s were"} indexed with a different embedding model`}>
          {stale.map((d) => d.filename).join(", ")}
        </Notice>
      ) : null}
    </section>
  );
}

function CorpusPageInner() {
  const { workspace } = useWorkspaceCtx();
  const { docs } = useDocuments(workspace);
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "documents";
  useBreadcrumb([{ label: workspace, href: "/sources" }, { label: "Corpus" }]);

  const totalChunks = docs.reduce((n, d) => n + (d.chunks || 0), 0);
  const failed = docs.filter((d) => d.status === "failed").length;
  const rail: RailStage[] = [
    { id: "d", label: "Documents", count: `${docs.length} documents`, state: failed ? "attention" : docs.length ? "complete" : "pending", hint: failed ? `${failed} failed` : undefined },
    { id: "c", label: "Chunks", count: `${totalChunks.toLocaleString()} chunks`, state: totalChunks ? "complete" : "pending" },
    { id: "k", label: "Knowledge", count: "indexed vectors", state: totalChunks ? "complete" : "pending" },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="tx-display">Corpus</h1>
          <p className="mt-1 tx-body text-text-secondary">
            {docs.length} documents, {totalChunks.toLocaleString()} chunks, indexed with the active embedding model.
          </p>
        </div>
      </header>
      <PipelineRail stages={rail} ariaLabel="Corpus pipeline" />
      <Tabs<Tab>
        ariaLabel="Corpus views"
        active={tab}
        onChange={(v) => router.replace(`/sources?tab=${v}`)}
        tabs={[
          { value: "documents", label: "Documents", count: docs.length },
          { value: "chunks", label: "Chunks" },
          { value: "index", label: "Index" },
        ]}
      />
      {tab === "documents" ? <DocumentsTab /> : tab === "chunks" ? <ChunksTab /> : <IndexTab />}
    </div>
  );
}

export default function CorpusPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <CorpusPageInner />
    </Suspense>
  );
}

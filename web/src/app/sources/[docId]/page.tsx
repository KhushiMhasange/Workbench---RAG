"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { deleteDocument, docFileUrl, getDocument, getSources } from "@/lib/api";
import type { DocRow } from "@/lib/types";
import { useBreadcrumb, useWorkspaceCtx } from "@/components/shell";
import { useHealth } from "@/components/use-health";
import { Chunk, PipelineRail, ProcessingStatus, toPassages, type Passage, type RailStage } from "@/components/rag";
import { Button, Dialog, EmptyState, Notice, Skeleton } from "@/components/ui";

function MetadataPanel({ doc, activeModel }: { doc: DocRow; activeModel?: string }) {
  const groups: { title: string; rows: [string, string, boolean][] }[] = [
    {
      title: "File",
      rows: [
        ["Name", doc.filename, false],
        ["Type", doc.mime || "–", false],
        ["Size", `${doc.size_bytes} bytes`, true],
        ["Hash", doc.doc_id, true],
      ],
    },
    {
      title: "Processing",
      rows: [
        ["Status", doc.status, false],
        ["Pages", String(doc.pages ?? "–"), true],
        ["Chunks", String(doc.chunks ?? "–"), true],
        ...(doc.error ? [["Error", doc.error, false] as [string, string, boolean]] : []),
      ],
    },
    {
      title: "Index",
      rows: [
        ["Embedding model", doc.embedding_model || "–", true],
        ["Active model", activeModel ?? "–", true],
      ],
    },
  ];
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <aside aria-label="Document metadata" className="chamfer-md-clip chamfer-focus w-full shrink-0 border border-border bg-surface p-4 lg:w-80">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="mb-4 last:mb-0">
          <h3 className="tx-label text-text-secondary">{g.title}</h3>
          <dl className="mt-1 space-y-2">
            {g.rows.map(([k, v, mono]) => (
              <div key={k}>
                <dt className="text-[12px] leading-4 text-text-secondary">{k}</dt>
                <dd className={`group flex items-center gap-1 text-text ${mono ? "tx-mono" : "tx-body"}`}>
                  <span className="min-w-0 flex-1 break-all">{v || "–"}</span>
                  {mono && v && v !== "–" ? (
                    <button
                      type="button"
                      aria-label={`Copy ${k}`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(v);
                        setCopied(k);
                        setTimeout(() => setCopied((c) => (c === k ? null : c)), 1500);
                      }}
                      className="shrink-0 rounded-sm px-1 tx-caption text-text-muted opacity-0 hover:bg-surface-hover hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      {copied === k ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </aside>
  );
}

function ingestStages(doc: DocRow): RailStage[] {
  const done = doc.status === "ready";
  const failed = doc.status === "failed";
  const pastParsing = ["parsing", "embedding", "ready"].includes(doc.status);
  const pastEmbedding = ["embedding", "ready"].includes(doc.status);
  const failAt: string = /pars/i.test(doc.error ?? "")
    ? "parsed"
    : /chunk/i.test(doc.error ?? "")
      ? "chunked"
      : "embedded";
  const stage = (id: string, label: string, s: RailStage["state"]): RailStage => ({ id, label, state: s });
  if (failed) {
    return [
      stage("uploaded", "Uploaded", "complete"),
      stage("parsed", "Parsed", failAt === "parsed" ? "failed" : "complete"),
      stage("chunked", "Chunked", failAt === "chunked" ? "failed" : doc.chunks > 0 ? "complete" : "pending"),
      stage("embedded", "Embedded", failAt === "embedded" ? "failed" : "pending"),
      stage("indexed", "Indexed", "pending"),
    ];
  }
  return [
    stage("uploaded", "Uploaded", "complete"),
    stage("parsed", "Parsed", pastParsing || done ? "complete" : "active"),
    stage("chunked", "Chunked", doc.chunks > 0 ? "complete" : pastParsing ? "active" : "pending"),
    stage("embedded", "Embedded", done ? "complete" : pastEmbedding ? "active" : "pending"),
    stage("indexed", "Indexed", done ? "complete" : "pending"),
  ];
}

function DocDetail() {
  const params = useParams<{ docId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspace } = useWorkspaceCtx();
  const { health } = useHealth();
  const docId = decodeURIComponent(params.docId);
  const highlight = searchParams.get("chunk");

  const [doc, setDoc] = useState<DocRow | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useBreadcrumb([
    { label: workspace, href: "/sources" },
    { label: "Corpus", href: "/sources?tab=documents" },
    { label: doc?.filename ?? docId.slice(0, 8) },
  ]);

  useEffect(() => {
    getDocument(workspace, docId).then(setDoc).catch((e: Error) => setError(e.message));
    getSources(workspace, 500)
      .then((d) => setPassages(toPassages((d.chunks as never[]).filter((c: { doc_id: string }) => c.doc_id === docId))))
      .catch(() => setPassages([]));
  }, [workspace, docId]);

  useEffect(() => {
    if (highlight) {
      const t = setTimeout(() => {
        document.getElementById(`chunk-${highlight}`)?.scrollIntoView({ block: "center" });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [highlight, passages.length]);

  const stale = useMemo(
    () => !!doc && !!health && !!doc.embedding_model && doc.embedding_model !== health.embedding_model,
    [doc, health],
  );

  if (error) {
    return (
      <Notice tone="critical" title="This workspace is not available" role="alert">
        {error}
      </Notice>
    );
  }
  if (!doc) {
    return (
      <div className="space-y-2" aria-label="Loading document">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="tx-display break-all">{doc.filename}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <ProcessingStatus status={doc.status} error={doc.error} />
            {stale ? (
              <span className="tx-caption text-warning">Indexed with a different embedding model than the active one.</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/?ask-doc=${encodeURIComponent(doc.doc_id)}`}
            className="inline-flex h-8 items-center gap-2 rounded-sm border border-border-input bg-surface px-3 tx-label text-text hover:bg-surface-hover"
          >
            Ask about this document
          </Link>
          <a
            href={docFileUrl(workspace, doc.doc_id)}
            className="inline-flex h-8 items-center gap-2 rounded-sm border border-border-input bg-surface px-3 tx-label text-text hover:bg-surface-hover"
          >
            Download original
          </a>
          <Button variant="destructive" size="md" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      </header>

      {doc.status === "failed" && doc.error ? (
        <Notice tone="critical" title="Processing failed" role="alert">
          {doc.error}
        </Notice>
      ) : null}

      <PipelineRail stages={ingestStages(doc)} ariaLabel="Ingestion pipeline" />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <h2 className="tx-h2">Chunks ({passages.length})</h2>
          {!passages.length ? (
            <EmptyState icon="corpus" heading="Chunks will appear here" body="This document is still being processed." />
          ) : (
            <ul className="mt-2 space-y-1">
              {passages.map((p) => (
                <li
                  key={p.key}
                  id={`chunk-${p.chunkId}`}
                  className={highlight === p.chunkId ? "rounded-sm bg-evidence-muted [animation:none]" : ""}
                >
                  <Chunk passage={p} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <MetadataPanel doc={doc} activeModel={health?.embedding_model} />
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete document"
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructiveFill"
              size="md"
              onClick={() => {
                void deleteDocument(workspace, doc.doc_id).then(() => router.push("/sources?tab=documents"));
              }}
            >
              Delete document
            </Button>
          </>
        }
      >
        <p className="tx-body text-text">
          Delete <strong>{doc.filename}</strong> and its {doc.chunks} chunks? This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}

export default function DocPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <DocDetail />
    </Suspense>
  );
}

import type { Answer, DocRow, Source, Workspace } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const MAX_UPLOAD_MB = 25;

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const getHealth = () => json<import("./types").Health>("/api/health");
export const getSources = (workspace: string, limit = 200) =>
  json<{ total: number; chunks: unknown[] }>(
    `/api/sources?workspace=${encodeURIComponent(workspace)}&limit=${limit}`,
  );
export const getEvalSummary = () => json<import("./types").EvalSummary>("/api/eval/summary");

export const search = (question: string, workspace: string, docIds?: string[]) =>
  json<{ question: string; results: Source[] }>("/api/search", {
    method: "POST",
    body: JSON.stringify({ question, workspace, doc_ids: docIds }),
  });

export const ask = (question: string, workspace: string, docIds?: string[], topK?: number) =>
  json<Answer>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ question, workspace, doc_ids: docIds, top_k: topK }),
  });

export const listWorkspaces = () =>
  json<{ workspaces: Workspace[] }>("/api/workspaces");

export const createWorkspace = (name: string) =>
  json<Workspace>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const deleteWorkspace = (name: string) =>
  json<{ deleted: string }>(`/api/workspaces/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

export const listDocuments = (workspace: string) =>
  json<{ workspace: string; documents: DocRow[] }>(
    `/api/workspaces/${encodeURIComponent(workspace)}/documents`,
  );

export const getDocument = (workspace: string, docId: string) =>
  json<import("./types").DocRow>(
    `/api/workspaces/${encodeURIComponent(workspace)}/documents/${encodeURIComponent(docId)}`,
  );

export const docFileUrl = (workspace: string, docId: string) =>
  `${API_URL}/api/workspaces/${encodeURIComponent(workspace)}/documents/${encodeURIComponent(docId)}/file`;

export const deleteDocument = (workspace: string, docId: string) =>
  json<{ deleted: string }>(
    `/api/workspaces/${encodeURIComponent(workspace)}/documents/${encodeURIComponent(docId)}`,
    { method: "DELETE" },
  );

export async function uploadDocuments(workspace: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspace)}/documents`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { workspace: string; documents: (DocRow & { error?: string })[] };
}

export type StreamHandlers = {
  onSources: (sources: Source[]) => void;
  onToken: (token: string) => void;
  onDone: (summary: {
    answer: string;
    citations: number[];
    abstained: boolean;
    guarded: boolean;
    guard_reasons: string[];
    refusal_reason?: string | null;
    latency_ms: number;
  }) => void;
  onError: (error: Error) => void;
};

export async function askStream(
  question: string,
  workspace: string,
  handlers: StreamHandlers,
  docIds?: string[],
  signal?: AbortSignal,
  topK?: number,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, workspace, doc_ids: docIds, top_k: topK }),
      signal,
    });
  } catch (error) {
    handlers.onError(error as Error);
    return;
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      detail = `${res.status} ${res.statusText}`;
    }
    handlers.onError(new Error(detail));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;
  const handle = (frame: string) => {
    const event = frame.match(/^event: (.+)$/m)?.[1];
    const data = frame.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) return;
    const payload = JSON.parse(data);
    if (event === "sources") handlers.onSources(payload.sources);
    else if (event === "token") handlers.onToken(payload.token);
    else if (event === "done") {
      sawDone = true;
      handlers.onDone(payload);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) handle(frame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } catch (error) {
    handlers.onError(error as Error);
    return;
  }
  if (!sawDone) handlers.onError(new Error("The stream ended before the answer was completed."));
}

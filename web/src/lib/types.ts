export type Chunk = {
  id: string;
  chunk_id?: string;
  ordinal: number;
  text: string;
  source: string;
  filename?: string;
  page?: number | null;
  char_len?: number;
  digest?: string;
};

export type Source = {
  id: string;
  chunk_id: string;
  doc_id: string;
  filename: string;
  page: number | null;
  heading?: string | null;
  text: string;
  source: string;
  score: number;
  rank: number;
  cited?: boolean;
};

export type Answer = {
  question: string;
  answer: string;
  citations: number[];
  abstained: boolean;
  refused?: boolean;
  refusal_reason?: string | null;
  gated: boolean;
  guarded: boolean;
  guard_reasons: string[];
  latency_ms: number;
  mode: string;
  sources: Source[];
};

export type Workspace = { name: string; documents: number; created_at?: number };

export type DocRow = {
  workspace: string;
  doc_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  status: string;
  error: string;
  pages: number;
  chunks: number;
  embedding_model: string;
};

export type Health = {
  ok?: boolean;
  ollama: boolean;
  startup_ms?: number | null;
  embedding_model: string;
  language_model: string;
  embedding_model_loaded: boolean;
  language_model_loaded: boolean;
  models: string[];
  qdrant?: unknown;
  qdrant_points_default?: number;
  db?: unknown;
};

export type EvalConfig = {
  config: string;
  note?: string;
  summary?: Record<string, unknown>;
  k?: number;
  hit?: number;
  mrr?: number;
  recall?: number;
  precision?: number;
  answers?: {
    fact_recall: number;
    claim_support_rate: number;
    citation_coverage: number;
    abstention_accuracy: number;
    forbidden_rate: number;
    generation_ms: number;
  };
};

export type EvalSummary = {
  available: boolean;
  hint?: string;
  meta?: Record<string, unknown>;
  config?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  suites?: Record<string, unknown>;
  configs?: EvalConfig[];
  report?: Record<string, unknown>;
};

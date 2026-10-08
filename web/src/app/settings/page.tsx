"use client";

import { useEffect, useState } from "react";
import { getEvalSummary } from "@/lib/api";
import { useBreadcrumb } from "@/components/shell";
import { useHealth } from "@/components/use-health";
import { useTheme } from "@/components/theme-provider";
import { Notice, Skeleton } from "@/components/ui";

export default function SettingsPage() {
  const { health } = useHealth();
  const { choice, setChoice } = useTheme();
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  useBreadcrumb([{ label: "Settings" }]);
  useEffect(() => {
    getEvalSummary()
      .then((s) => setConfig((s.config ?? {}) as Record<string, unknown>))
      .catch(() => setConfig({}));
  }, []);

  return (
    <div className="max-w-[640px] space-y-8">
      <header>
        <h1 className="tx-display">Settings</h1>
        <p className="mt-1 tx-body text-text-secondary">Settings are read-only here. Change them where the server runs.</p>
      </header>

      <section aria-label="Appearance" className="space-y-2">
        <h2 className="tx-h2">Appearance</h2>
        <div role="radiogroup" aria-label="Colour theme" className="flex gap-2">
          {(["system", "light", "dark"] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={choice === v}
              onClick={() => setChoice(v)}
              className={`h-8 rounded-sm border px-3 tx-label ${choice === v ? "border-primary-border bg-primary-muted text-text" : "border-border-input text-text-secondary hover:text-text"}`}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Models" className="space-y-2">
        <h2 className="tx-h2">Models</h2>
        {!health ? (
          <Skeleton className="h-20" />
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              ["Embedding model", health.embedding_model, health.embedding_model_loaded ? "Loaded" : "Not loaded"],
              ["Language model", health.language_model, health.language_model_loaded ? "Loaded" : "Not loaded"],
            ].map(([k, v, s]) => (
              <div key={k} className="rounded-sm border border-border bg-surface px-3 py-2">
                <dt className="tx-caption text-text-muted">{k}</dt>
                <dd className="tx-mono text-text">{String(v)}</dd>
                <dd className="tx-caption text-text-muted">{s}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-label="Retrieval configuration" className="space-y-2">
        <h2 className="tx-h2">Retrieval configuration</h2>
        {config == null ? (
          <Skeleton className="h-20" />
        ) : !Object.keys(config).length ? (
          <Notice tone="neutral" title="No configuration reported">
            Run an evaluation to see the active retrieval configuration.
          </Notice>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(config).map(([k, v]) => (
              <div key={k} className="rounded-sm border border-border bg-surface px-3 py-2">
                <dt className="tx-mono-sm text-text-muted">{k}</dt>
                <dd className="tx-mono text-text tabular">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

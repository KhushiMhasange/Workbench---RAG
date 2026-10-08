"use client";

import { Fragment, useState } from "react";
import type { Passage } from "@/components/rag";

export function AnswerText({
  text,
  citedRanks,
  passages,
  activeRank,
  onOpenCitation,
  streaming = false,
}: {
  text: string;
  citedRanks: number[];
  passages: Passage[];
  activeRank: number | null;
  onOpenCitation: (rank: number) => void;
  streaming?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const parts = text.split(/(\[\d+\])/g);
  const byRank = new Map(passages.map((p) => [p.rank, p]));

  return (
    <div className="tx-reading reading-col text-text" aria-live="off">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) {
          return <Fragment key={i}>{part}</Fragment>;
        }
        const rank = Number(match[1]);
        const passage = byRank.get(rank);
        const cited = citedRanks.includes(rank);
        const active = activeRank === rank;
        if (!passage || !cited) {
          return (
            <span
              key={i}
              title="This citation does not match a retrieved passage"
              className="mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-sm border border-error px-1 tx-mono-sm font-semibold text-error"
            >
              {rank}
            </span>
          );
        }
        return (
          <span key={i} className="relative inline-flex">
            <button
              type="button"
              onClick={() => onOpenCitation(rank)}
              onMouseEnter={() => setPreview(rank)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(rank)}
              onBlur={() => setPreview(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") (e.target as HTMLElement).blur();
              }}
              aria-label={`Citation ${rank}, ${passage.filename}${passage.page ? `, page ${passage.page}` : ""}`}
              className={`mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-sm border px-1 tx-mono-sm font-semibold transition-colors duration-[80ms] ${
                active
                  ? "border-primary bg-primary text-text-on-primary"
                  : "border-primary-border bg-primary-muted text-primary-text hover:border-primary"
              }`}
            >
              {rank}
            </button>
            {preview === rank ? (
              <span role="tooltip" className="absolute bottom-full left-1/2 z-20 mb-1 w-64 -translate-x-1/2 rounded-sm border border-border bg-surface-elevated p-2 text-left shadow-[var(--shadow-popover)]">
                <span className="block tx-label text-text">
                  {passage.filename}
                  {passage.page ? `, p. ${passage.page}` : ""}
                </span>
                {passage.heading ? (
                  <span className="block tx-caption text-text-muted">{passage.heading}</span>
                ) : null}
                <span className="mt-1 block tx-caption text-text-secondary">
                  {passage.text.slice(0, 160)}
                  {passage.text.length > 160 ? "…" : ""}
                </span>
              </span>
            ) : null}
          </span>
        );
      })}
      {streaming ? (
        <span aria-hidden="true" className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] bg-primary [animation:caret-blink_1s_infinite]" />
      ) : null}
    </div>
  );
}

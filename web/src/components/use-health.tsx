"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import type { Health } from "@/lib/types";

/** Backend health, polled gently so the header never claims a stale "ready". */
export function useHealth(intervalMs = 15_000) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await getHealth();
        if (alive) setHealth(next);
      } catch {
        if (alive) setHealth(null);
      }
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { health };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createWorkspace, deleteWorkspace, listDocuments, listWorkspaces } from "@/lib/api";
import type { DocRow, Workspace } from "@/lib/types";

export const WS_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspaceState] = useState<string>(() =>
    typeof window === "undefined" ? "default" : localStorage.getItem("rag-workspace") || "default",
  );
  const setWorkspace = useCallback((ws: string) => {
    setWorkspaceState(ws);
    try {
      localStorage.setItem("rag-workspace", ws);
    } catch {}
  }, []);
  const refresh = useCallback(async () => {
    try {
      const res = await listWorkspaces();
      setWorkspaces(res.workspaces);
      if (!res.workspaces.some((w) => w.name === workspace) && res.workspaces.length) {
        setWorkspace(res.workspaces[0].name);
      }
    } catch {}
  }, [workspace, setWorkspace]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const create = useCallback(
    async (name: string) => {
      const ws = await createWorkspace(name);
      await refresh();
      setWorkspace(name);
      return ws;
    },
    [refresh, setWorkspace],
  );
  const remove = useCallback(
    async (name: string) => {
      await deleteWorkspace(name);
      await refresh();
    },
    [refresh],
  );
  return { workspaces, workspace, setWorkspace, create, remove, refresh };
}

export function useDocuments(workspace: string) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    try {
      const res = await listDocuments(workspace);
      setDocs(res.documents);
      setError(null);
      return res.documents;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, [workspace]);
  useEffect(() => {
    setSelected([]);
    void refresh();
  }, [workspace, refresh]);
  useEffect(() => {
    if (!docs.some((d) => d.status !== "ready" && d.status !== "failed")) return;
    const id = setInterval(() => void refresh(), 1500);
    return () => clearInterval(id);
  }, [docs, refresh]);
  return { docs, error, refresh, selected, setSelected };
}

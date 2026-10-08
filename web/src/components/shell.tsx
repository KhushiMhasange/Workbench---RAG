"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listDocuments } from "@/lib/api";
import type { DocRow } from "@/lib/types";
import { useHealth } from "@/components/use-health";
import { useWorkspaces } from "@/components/use-rag";
import { useTheme } from "@/components/theme-provider";
import { Badge, Breadcrumb, Button, Dialog, DotMatrix, Input } from "@/components/ui";
import { Icon } from "@/components/icons";

/* Workspace scope: every page shares one workspace. */

type WorkspaceCtx = ReturnType<typeof useWorkspaces>;
const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspaceCtx(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaceCtx must be used inside <AppShell>");
  return ctx;
}

type Crumb = { label: string; href?: string };
const CrumbCtx = createContext<{ crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void }>({
  crumbs: [],
  setCrumbs: () => {},
});

export function useBreadcrumb(crumbs: Crumb[]) {
  const { setCrumbs } = useContext(CrumbCtx);
  useEffect(() => {
    setCrumbs(crumbs);
  }, [JSON.stringify(crumbs), setCrumbs]);
}

const NAV = [
  { href: "/", label: "Ask", icon: "ask" as const },
  { href: "/sources", label: "Corpus", icon: "corpus" as const },
  { href: "/evaluation", label: "Measurements", icon: "measurements" as const },
];

const WS_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function WorkspaceMenu() {
  const { workspaces, workspace, setWorkspace, create, refresh } = useWorkspaceCtx();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace, current ${workspace}. Change workspace`}
        className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-surface-hover"
      >
        <Icon name="database" size={16} className="shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1 truncate tx-label text-text" data-rail-label>
          {workspace}
        </span>
        <Icon name="chevronDown" size={16} className="shrink-0 text-text-muted" data-rail-label />
      </button>
      {open ? (
        <div role="menu" aria-label="Workspaces" className="absolute top-full left-0 z-20 mt-1 w-60 rounded-sm border border-border bg-surface-elevated p-1 shadow-[var(--shadow-popover)]">
          {workspaces.map((w) => (
            <button
              key={w.name}
              role="menuitemradio"
              aria-checked={w.name === workspace}
              onClick={() => {
                setWorkspace(w.name);
                setOpen(false);
              }}
              className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 tx-label hover:bg-surface-hover ${w.name === workspace ? "bg-primary-muted text-text" : "text-text-secondary"}`}
            >
              {w.name === workspace ? <Icon name="check" size={16} className="text-primary" /> : <span className="w-4" />}
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="tx-mono-sm text-text-muted tabular">{w.documents}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            {!creating ? (
              <button
                role="menuitem"
                onClick={() => setCreating(true)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 tx-label text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                <Icon name="plus" size={16} /> New workspace
              </button>
            ) : (
              <form
                className="p-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!WS_RE.test(name)) {
                    setError("Lowercase letters, numbers, - and _ only, up to 40 characters.");
                    return;
                  }
                  try {
                    await create(name);
                    setName("");
                    setCreating(false);
                    setError(null);
                    setOpen(false);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <Input
                  label="New workspace name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={error ?? undefined}
                  placeholder="research"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit">
                    Create workspace
                  </Button>
                </div>
              </form>
            )}
            <Link
              href="/sources?tab=documents"
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-2 rounded-sm px-2 tx-label text-text-secondary hover:bg-surface-hover hover:text-text"
            >
              <Icon name="settings" size={16} /> Manage workspaces
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusIndicator() {
  const { health } = useHealth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  const rows: { label: string; ok: boolean; detail: string }[] = health
    ? [
        { label: "Embedding model", ok: health.embedding_model_loaded, detail: health.embedding_model },
        { label: "Language model", ok: health.language_model_loaded, detail: health.language_model },
        { label: "Vector store", ok: health.qdrant === true, detail: typeof health.qdrant === "string" ? health.qdrant : "reachable" },
        { label: "Registry", ok: health.db === true, detail: typeof health.db === "string" ? health.db : "readable" },
      ]
    : [];
  const allOk = health != null && rows.every((r) => r.ok);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={health ? (allOk ? "System status: all dependencies reachable" : "System status: a dependency is unavailable") : "System status: backend not reachable"}
        title={health ? (allOk ? "All dependencies reachable" : "A dependency is unavailable") : "Backend not reachable"}
        className={`inline-flex h-7 items-center gap-2 rounded-sm border px-2 tx-mono-sm ${
          allOk ? "border-success bg-success-muted text-success" : "border-error bg-error-muted text-error"
        }`}
      >
        <span aria-hidden="true" className="flex items-center gap-1">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${allOk ? "bg-success" : "bg-error"}`} />
          <span className="hidden sm:inline">{allOk ? "READY" : "DEGRADED"}</span>
        </span>
        <span aria-hidden="true" className="text-text-muted">//</span>
        <DotMatrix />
      </button>
      {open ? (
        <div role="dialog" aria-label="System status" className="absolute top-full right-0 z-20 mt-1 w-72 rounded-sm border border-border bg-surface-elevated p-3 shadow-[var(--shadow-popover)]">
          {!health ? (
            <p className="tx-body text-text-secondary">The server cannot be reached. Start it with python -m rag.cli serve.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.label} className="flex items-start gap-2">
                  <Badge tone={r.ok ? "positive" : "critical"}>{r.ok ? "Up" : "Down"}</Badge>
                  <span className="min-w-0">
                    <span className="block tx-label text-text">{r.label}</span>
                    <span className="block truncate tx-mono-sm text-text-muted" title={r.detail}>
                      {r.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { workspaces, workspace, setWorkspace } = useWorkspaceCtx();
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  useEffect(() => {
    if (!open) return;
    setQ("");
    listDocuments(workspace).then((r) => setDocs(r.documents)).catch(() => setDocs([]));
  }, [open, workspace]);
  const commands = useMemo(
    () => [
      { label: "Go to Ask", hint: "g a", run: () => router.push("/") },
      { label: "Go to Corpus", hint: "g c", run: () => router.push("/sources") },
      { label: "Go to Measurements", hint: "g m", run: () => router.push("/evaluation") },
      { label: "Go to Settings", hint: "", run: () => router.push("/settings") },
    ],
    [router],
  );
  const needle = q.trim().toLowerCase();
  const wsHits = workspaces.filter((w) => w.name.toLowerCase().includes(needle)).slice(0, 5);
  const docHits = docs.filter((d) => d.filename.toLowerCase().includes(needle)).slice(0, 6);
  const cmdHits = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle));
  return (
    <Dialog open={open} onClose={onClose} title="Search and commands">
      <Input label="Search documents, workspaces and commands" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter" />
      <div className="mt-3 max-h-80 overflow-y-auto">
        {cmdHits.length ? (
          <>
            <p className="tx-label text-text-muted">Commands</p>
            {cmdHits.map((c) => (
              <button key={c.label} onClick={() => { onClose(); c.run(); }} className="flex h-8 w-full items-center justify-between rounded-sm px-2 tx-body text-text hover:bg-surface-hover">
                {c.label}
                {c.hint ? <span className="tx-mono-sm text-text-muted">{c.hint}</span> : null}
              </button>
            ))}
          </>
        ) : null}
        {wsHits.length ? (
          <>
            <p className="mt-2 tx-label text-text-muted">Workspaces</p>
            {wsHits.map((w) => (
              <button key={w.name} onClick={() => { setWorkspace(w.name); onClose(); }} className="flex h-8 w-full items-center rounded-sm px-2 tx-body text-text hover:bg-surface-hover">
                Switch to {w.name}
              </button>
            ))}
          </>
        ) : null}
        {docHits.length ? (
          <>
            <p className="mt-2 tx-label text-text-muted">Documents in {workspace}</p>
            {docHits.map((d) => (
              <button key={d.doc_id} onClick={() => { onClose(); router.push(`/sources/${encodeURIComponent(d.doc_id)}`); }} className="flex h-8 w-full items-center justify-between rounded-sm px-2 tx-body text-text hover:bg-surface-hover">
                <span className="truncate">{d.filename}</span>
                <span className="tx-mono-sm text-text-muted">{d.status}</span>
              </button>
            ))}
          </>
        ) : null}
        {!cmdHits.length && !wsHits.length && !docHits.length ? (
          <p className="py-4 text-center tx-body text-text-muted">No matches for “{q}”.</p>
        ) : null}
      </div>
    </Dialog>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Cmd or Ctrl + K", "Open search and commands"],
    ["g then a / c / m", "Go to Ask, Corpus, Measurements"],
    ["/", "Focus search"],
    ["?", "Show shortcuts"],
    ["Enter / Shift+Enter", "Ask / new line"],
    ["Escape", "Stop generation, close dialogs"],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <table className="w-full tx-body">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-b-0">
              <td className="py-2 pr-3 tx-mono text-text-secondary">{k}</td>
              <td className="py-2 text-text">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ws = useWorkspaces();
  const pathname = usePathname();
  const router = useRouter();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [rail, setRail] = useState<"expanded" | "collapsed">("expanded");
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const { choice, setChoice } = useTheme();

  useEffect(() => {
    try {
      setRail(window.innerWidth < 1024 ? "collapsed" : "expanded");
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (typing) return;
      if (e.key === "?") setShortcuts(true);
      else if (e.key === "g") {
        const next = (ev: KeyboardEvent) => {
          if (ev.key === "a") router.push("/");
          else if (ev.key === "c") router.push("/sources");
          else if (ev.key === "m") router.push("/evaluation");
          document.removeEventListener("keydown", next);
        };
        document.addEventListener("keydown", next, { once: true });
        setTimeout(() => document.removeEventListener("keydown", next), 1200);
      } else if (e.key === "/") {
        const el = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (el) {
          e.preventDefault();
          el.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const crumbValue = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);

  const nav = (
    <nav aria-label="Primary" className="mt-2">
      <ul className="space-y-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileNav(false)}
                title={item.label}
                className={`relative flex h-8 items-center gap-2 rounded-sm px-2 tx-label transition-colors duration-[80ms] ${
                  active ? "bg-primary-muted text-text" : "text-text-secondary hover:bg-surface-hover hover:text-text"
                }`}
              >
                <span aria-hidden="true" className={`absolute top-1 bottom-1 left-0 w-px bg-accent-line ${active ? "opacity-100" : "opacity-0"}`} />
                <span className="relative flex w-full items-center gap-2">
                  <Icon name={item.icon} size={16} className={active ? "text-primary" : ""} />
                  <span data-rail-label className="flex-1">{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const cycleTheme = useCallback(() => {
    setChoice(choice === "dark" ? "light" : choice === "light" ? "system" : "dark");
  }, [choice, setChoice]);

  return (
    <Ctx.Provider value={ws}>
      <CrumbCtx.Provider value={crumbValue}>
        <div className="flex min-h-screen">
          <aside
            aria-label="Primary"
            className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface px-2 py-3 transition-[width] duration-[200ms] md:flex ${rail === "expanded" ? "w-60" : "w-14 rail-collapsed"}`}
          >
            <Link href="/" aria-label="rag WORKBENCH home" className="flex h-8 items-center gap-2 px-2">
              <span className="wordmark-rag tx-mono-sm">rag</span>
              <span data-rail-label className="wordmark-bench text-[13px] leading-4">
                WORKBENCH
              </span>
            </Link>
            <div className="status-strip-rule mt-2 hidden pt-2" data-rail-label>
              <span className="flex items-center gap-2 px-2 tx-mono-sm text-text-muted">
                <DotMatrix />
                <span className="truncate">HUD // READY</span>
              </span>
            </div>
            <WorkspaceMenu />
            {nav}
            <div className="mt-auto space-y-0.5">
              <button
                type="button"
                onClick={() => setShortcuts(true)}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 tx-label text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                <Icon name="help" size={16} />
                <span data-rail-label>Help</span>
              </button>
              <Link href="/settings" className="flex h-8 items-center gap-2 rounded-sm px-2 tx-label text-text-secondary hover:bg-surface-hover hover:text-text">
                <Icon name="settings" size={16} />
                <span data-rail-label>Settings</span>
              </Link>
              <button
                type="button"
                onClick={() => setRail((r) => (r === "expanded" ? "collapsed" : "expanded"))}
                aria-label={rail === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
                className="hidden h-8 w-full items-center gap-2 rounded-sm px-2 tx-label text-text-secondary hover:bg-surface-hover hover:text-text md:flex"
              >
                <Icon name={rail === "expanded" ? "chevronDown" : "chevronRight"} size={16} />
                <span data-rail-label>{rail === "expanded" ? "Collapse" : "Expand"}</span>
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg px-4">
              <button
                type="button"
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-hover md:hidden"
              >
                <Icon name="menu" size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <Breadcrumb items={crumbs} />
              </div>
              <button
                type="button"
                onClick={() => setPalette(true)}
                aria-label="Search and commands"
                className="hidden h-8 items-center gap-2 rounded-sm border border-border-input bg-surface px-2 tx-body text-text-muted hover:text-text sm:inline-flex"
              >
                <Icon name="search" size={16} />
                <span className="hidden lg:inline">Search</span>
                <kbd className="rounded-sm border border-border bg-surface-sunken px-1 tx-mono-sm text-text-muted">⌘K</kbd>
              </button>
              <StatusIndicator />
              <button
                type="button"
                onClick={cycleTheme}
                aria-label={`Colour theme, current ${choice}. Activate to change.`}
                title={`Theme: ${choice}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                <Icon name={choice === "dark" ? "moon" : choice === "light" ? "sun" : "command"} size={16} />
                <span className="sr-only">Theme: {choice}</span>
              </button>
            </header>
            <main id="main" className="hud-grid min-w-0 flex-1 px-8 py-8 max-md:px-4">
              {children}
            </main>
          </div>
        </div>

        {mobileNav ? (
          <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-label="Navigation" aria-modal="true">
            <div className="absolute inset-0 bg-overlay" onClick={() => setMobileNav(false)} aria-hidden="true" />
            <div className="absolute top-0 left-0 flex h-full w-60 flex-col border-r border-border bg-surface px-2 py-3">
              <Link href="/" aria-label="rag WORKBENCH home" className="flex h-8 items-center gap-2 px-2">
                <span className="wordmark-rag tx-mono-sm">rag</span>
                <span className="wordmark-bench text-[13px] leading-4">WORKBENCH</span>
              </Link>
              <WorkspaceMenu />
              {nav}
              <div className="mt-auto">
                <Link href="/settings" onClick={() => setMobileNav(false)} className="flex h-8 items-center gap-2 rounded-sm px-2 tx-label text-text-secondary">
                  <Icon name="settings" size={16} /> Settings
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <CommandPalette open={palette} onClose={() => setPalette(false)} />
        <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      </CrumbCtx.Provider>
    </Ctx.Provider>
  );
}

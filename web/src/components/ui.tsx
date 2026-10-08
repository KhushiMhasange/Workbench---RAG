"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/icons";

/* Base primitives per DESIGN.md theme patch v2 "Night City instrument".
   Token-driven, both themes from tokens. Chamfered corners on big shapes,
   near-square 2px on small controls. */

export type ChamferSize = "sm" | "md" | "lg";

const CHAMFER_CLIP: Record<ChamferSize, string> = {
  sm: "chamfer-sm-clip",
  md: "chamfer-md-clip",
  lg: "chamfer-lg-clip",
};

/* Reusable Chamfer primitive. Do not hand-roll clip-path per component.
   Draws the 1px edge with a wrapper in border colour and an inner element
   inset by 1px with the same polygon. Cut only top-right + bottom-left. */
export function Chamfer({
  size = "md",
  className = "",
  innerClassName = "",
  children,
}: {
  size?: ChamferSize;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${CHAMFER_CLIP[size]} chamfer-focus bg-border p-px ${className}`}>
      <div className={`${CHAMFER_CLIP[size]} bg-surface ${innerClassName}`}>{children}</div>
    </div>
  );
}

export function CornerTicks() {
  return (
    <>
      <span aria-hidden="true" className="corner-tick corner-tick-tl" />
      <span aria-hidden="true" className="corner-tick corner-tick-br" />
    </>
  );
}

export function DotMatrix({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`dot-matrix inline-block h-4 w-4 ${className}`}
    />
  );
}

export function StatusStrip({ items }: { items: string[] }) {
  return (
    <div className="status-strip-rule flex h-7 items-center gap-2 overflow-hidden px-3 tx-mono-sm text-text-muted">
      <DotMatrix />
      <span className="truncate">
        {items.map((item, i) => (
          <span key={`${item}-${i}`}>
            {i > 0 ? <span aria-hidden="true" className="mx-2 text-text-muted">//</span> : null}
            <span>{item}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "destructiveFill";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_HEIGHT: Record<ButtonSize, string> = { sm: "h-7", md: "h-8", lg: "h-10" };

const BUTTON_STYLE: Record<ButtonVariant, string> = {
  primary:
    "border-transparent text-text-on-primary [background-image:var(--gradient-primary)] hover:brightness-110 active:brightness-95 disabled:brightness-100",
  secondary:
    "border-border-input bg-surface text-text hover:bg-surface-hover active:bg-surface-sunken",
  ghost: "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-sunken",
  destructive: "border-transparent text-error hover:bg-error-muted active:bg-error-muted",
  destructiveFill: "border-transparent bg-error text-white hover:brightness-110",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`chamfer-sm-clip chamfer-focus inline-flex items-center justify-center gap-2 border px-3 tx-label font-semibold whitespace-nowrap transition-colors duration-[80ms] disabled:cursor-not-allowed disabled:border-border disabled:text-text-muted disabled:[background-image:none] disabled:bg-surface ${BUTTON_HEIGHT[size]} ${BUTTON_STYLE[variant]} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  size = 32,
  className = "",
  ...rest
}: {
  label: string;
  icon: IconName;
  size?: 28 | 32;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-sm border border-transparent text-text-secondary transition-colors duration-[80ms] hover:bg-surface-hover hover:text-text active:bg-surface-sunken disabled:text-text-muted ${size === 28 ? "h-7 w-7" : "h-8 w-8"} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

const CONTROL =
  "h-8 w-full rounded-sm border border-border-input bg-surface px-3 tx-body text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:text-text-muted";

export function Input({
  label,
  error,
  hint,
  id,
  className = "",
  ...rest
}: {
  label?: string;
  error?: string;
  hint?: string;
  id?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block tx-label text-text-secondary">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={`${CONTROL} ${error ? "border-error" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-err` : undefined}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-err`} className="mt-1 flex items-center gap-1 tx-caption text-error">
          <Icon name="alertCircle" size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 tx-caption text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Textarea({
  label,
  id,
  className = "",
  ...rest
}: { label?: string; id?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block tx-label text-text-secondary">
          {label}
        </label>
      ) : null}
      <textarea id={inputId} className={`${CONTROL} h-auto min-h-14 py-2`} {...rest} />
    </div>
  );
}

export function Select({
  label,
  id,
  children,
  className = "",
  ...rest
}: { label?: string; id?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block tx-label text-text-secondary">
          {label}
        </label>
      ) : null}
      <select id={inputId} className={CONTROL} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function Checkbox({
  label,
  id,
  className = "",
  ...rest
}: { label?: ReactNode; id?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-border-input bg-surface transition-colors duration-[80ms] checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 [&:checked]:bg-[image:none]"
        {...rest}
      />
      {label ? (
        <label htmlFor={inputId} className="cursor-pointer tx-body text-text">
          {label}
        </label>
      ) : null}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: { value: T; label: string; count?: number }[];
  active: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const selected = t.value === active;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            className={`-mb-px inline-flex h-9 shrink-0 items-center gap-1 border-b-2 px-3 tx-label whitespace-nowrap transition-colors duration-[140ms] ${
              selected
                ? "border-primary text-text"
                : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span className="rounded-sm border border-border bg-surface-sunken px-1 tx-mono-sm text-text-muted tabular">
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type Tone = "neutral" | "accent" | "positive" | "caution" | "critical" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-surface-sunken text-text-secondary",
  accent: "border-primary-border bg-primary-muted text-primary-text",
  positive: "border-success bg-success-muted text-success",
  caution: "border-warning bg-warning-muted text-warning",
  critical: "border-error bg-error-muted text-error",
  info: "border-info bg-info-muted text-info",
};

const TONE_ICON: Record<Tone, IconName | null> = {
  neutral: null,
  accent: null,
  positive: "checkCircle",
  caution: "alertTriangle",
  critical: "alertCircle",
  info: "info",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName | false;
  title?: string;
  className?: string;
}) {
  const glyph = icon === false ? null : (icon ?? TONE_ICON[tone]);
  return (
    <span
      title={title}
      className={`inline-flex h-5 items-center gap-1 rounded-sm border px-1 text-[12px] leading-4 font-medium tabular ${TONE_CLASS[tone]} ${className}`}
    >
      {glyph ? <Icon name={glyph} size={14} /> : null}
      {children}
    </span>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden max-w-60 -translate-x-1/2 rounded-sm border border-border bg-surface-elevated px-2 py-1 text-left text-[12px] leading-4 text-text opacity-0 shadow-[var(--shadow-popover)] transition-opacity delay-[400ms] duration-[140ms] group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function Popover({
  trigger,
  label,
  children,
  align = "left",
  className = "",
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
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
  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <span onClick={() => setOpen((v) => !v)} aria-label={label}>
        {trigger}
      </span>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={`absolute top-full z-20 mt-1 min-w-52 rounded-sm border border-border bg-surface-elevated p-2 shadow-[var(--shadow-popover)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Menu({
  trigger,
  label,
  items,
}: {
  trigger: ReactNode;
  label: string;
  items: { label: string; icon?: IconName; danger?: boolean; onSelect: () => void }[];
}) {
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
  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full left-0 z-20 mt-1 min-w-48 rounded-sm border border-border bg-surface-elevated p-1 shadow-[var(--shadow-popover)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 tx-label whitespace-nowrap hover:bg-surface-hover ${item.danger ? "text-error" : "text-text"}`}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open ]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`chamfer-lg-clip chamfer-focus border border-border bg-surface-elevated p-0 text-text shadow-[var(--shadow-dialog)] backdrop:bg-overlay ${wide ? "w-full max-w-[720px]" : "w-full max-w-[560px]"}`}
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="tx-h3">{title}</h2>
      </div>
      <div className="px-4 py-4">{children}</div>
      {actions ? (
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{actions}</div>
      ) : null}
    </dialog>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      closeRef.current?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open ]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30" role="dialog" aria-label={title} aria-modal="true">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className={`chamfer-lg-clip absolute top-0 right-0 flex h-full flex-col border border-border bg-surface-elevated shadow-[var(--shadow-dialog)] ${wide ? "w-full max-w-[640px]" : "w-full max-w-[480px]"}`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="tx-h3">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-hover hover:text-text"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export type ToastTone = "neutral" | "positive" | "critical";

export function Toast({
  tone = "neutral",
  title,
  onDismiss,
}: {
  tone?: ToastTone;
  title: string;
  onDismiss: () => void;
}) {
  const style =
    tone === "positive"
      ? "border-success bg-success-muted text-success"
      : tone === "critical"
        ? "border-error bg-error-muted text-error"
        : "border-border bg-surface-elevated text-text";
  return (
    <div role="status" className={`chamfer-md-clip flex items-center gap-2 border px-3 py-2 tx-body shadow-[var(--shadow-popover)] ${style}`}>
      <span className="flex-1">{title}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface-hover"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function Table({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table aria-label={ariaLabel} className="w-full border-collapse tx-body">
        {children}
      </table>
    </div>
  );
}

export function SortHeader({
  label,
  active,
  direction,
  onSort,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc" | null;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      className="inline-flex items-center gap-1 tx-label text-text-secondary hover:text-text"
    >
      {label}
      <span aria-hidden="true" className="tx-mono-sm text-text-muted">
        {active ? (direction === "asc" ? "↑" : "↓") : ""}
      </span>
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-surface-hover [animation:skeleton-shimmer_var(--duration-slow)_infinite] ${className}`}
    />
  );
}

export function ProgressBar({ value, label }: { value?: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1 w-full overflow-hidden rounded-xs bg-border">
      {value == null ? (
        <div className="h-full w-1/3 rounded-xs bg-primary [animation:rail-pulse_1.2s_infinite]" />
      ) : (
        <div className="h-full rounded-xs bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
  role,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  const glyph = TONE_ICON[tone];
  return (
    <div role={role} className={`chamfer-md-clip chamfer-focus border px-3 py-2 tx-body ${TONE_CLASS[tone]}`}>
      <p className="flex items-center gap-2 font-medium">
        {glyph ? <Icon name={glyph} size={16} /> : null}
        {title}
      </p>
      {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  heading,
  body,
  actions,
}: {
  icon: IconName;
  heading: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="text-text-muted">
        <Icon name={icon} size={32} />
      </span>
      <h3 className="mt-3 tx-h3">{heading}</h3>
      <p className="mt-1 max-w-md tx-body text-text-secondary">{body}</p>
      {actions ? <div className="mt-4 flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 tx-body text-text-secondary">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 ? (
              <span aria-hidden="true" className="text-text-muted">
                /
              </span>
            ) : null}
            {item.href ? (
              <a href={item.href} className="truncate text-primary-text underline hover:text-primary">
                {item.label}
              </a>
            ) : (
              <span aria-current="page" className="truncate text-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<{ id: number; tone: ToastTone; title: string }[]>([]);
  const idRef = useRef(1);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (title: string, tone: ToastTone = "neutral") => {
      const id = idRef.current++;
      setToasts((prev) => [...prev.slice(-2), { id, tone, title }]);
      if (tone !== "critical") {
        setTimeout(() => dismiss(id), 5000);
      }
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; tone: ToastTone; title: string }[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} tone={t.tone} title={t.title} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

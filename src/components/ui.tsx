import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "navy";
export function Button({ variant = "primary", size = "md", loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v = {
    primary: "bg-orange text-white hover:bg-orange-dark shadow-sm",
    navy: "bg-navy text-white hover:bg-navy-2",
    secondary: "bg-white text-ink border border-rule hover:bg-cloud",
    ghost: "text-body hover:bg-ink/5",
    danger: "bg-white text-danger border border-danger/30 hover:bg-danger-tint",
  }[variant];
  const s = { sm: "h-9 px-3 text-sm rounded-lg", md: "h-11 px-4 text-[15px] rounded-xl", lg: "h-12 px-5 text-base rounded-xl" }[size];
  return (
    <button className={cx("inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none", v, s, className)}
      disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ className, label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex h-10 w-10 items-center justify-center rounded-xl text-body hover:bg-ink/5 transition", className)} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-muted", className)} />;
}
export function PageLoader() {
  return <div className="flex h-60 items-center justify-center"><Spinner className="h-6 w-6" /></div>;
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-tint text-blue">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2"><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex gap-2 border-t border-rule px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function StageBadge({ name, color }: { name: string; color: string }) {
  return <span className="chip text-ink" style={{ background: `${color}1F` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{name}</span>;
}

const TEMP = { hot: { label: "Hot", cls: "bg-danger-tint text-danger" }, warm: { label: "Warm", cls: "bg-orange-tint text-orange-dark" }, cold: { label: "Cold", cls: "bg-blue-tint text-blue" } } as const;
export function TempBadge({ t }: { t: "hot" | "warm" | "cold" | null }) {
  if (!t) return null;
  return <span className={cx("chip", TEMP[t].cls)}>{TEMP[t].label}</span>;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-navy font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-ink/5 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx("h-8 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition", value === o.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop", t.kind === "ok" ? "bg-navy" : "bg-danger")}>
            {t.kind === "ok" ? <CheckCircle2 className="h-4 w-4 text-amber" /> : <AlertCircle className="h-4 w-4" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Turn Supabase/Postgres errors into plain-language messages. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  if (msg.includes("leads_phone_active_uniq")) return "A lead with this mobile number already exists.";
  if (msg.includes("leads_phone_check")) return "Enter a valid 10-digit mobile number.";
  if (msg.includes("leads_pincode_check")) return "Enter a valid 6-digit pincode.";
  if (msg.includes("row-level security")) return "You don't have permission to do that.";
  if (msg.includes("Failed to fetch")) return "No internet connection. Your entry is kept; please try again.";
  return msg;
}

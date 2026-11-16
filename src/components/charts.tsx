import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Table2 } from "lucide-react";
import { cx } from "./ui";

/**
 * Small chart kit for the dashboard. Rules (from the dataviz guide):
 * thin marks (bars <= 24px, 4px rounded data-end), hairline solid grid, one axis,
 * text never in the series colour, legend for 2+ series, a tooltip on hover/focus,
 * and every chart can switch to a table so no value is hidden behind a hover.
 */

export const SERIES = { blue: "#2D6CDF", orange: "#F58220", navy: "#0A1F3C" } as const;

/** Card with a title and a Chart / Table switch. */
export function ChartCard({ title, subtitle, table, children, className, action }: {
  title: string; subtitle?: ReactNode; table?: { head: string[]; rows: (string | number)[][] }; children: ReactNode; className?: string; action?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cx("card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <button onClick={() => setAsTable((x) => !x)} aria-label={asTable ? "Show as chart" : "Show as table"} title={asTable ? "Show as chart" : "Show as table"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
              {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {asTable && table ? <DataTable head={table.head} rows={table.rows} /> : children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-rule text-left text-xs font-semibold text-muted">
          {head.map((h, i) => <th key={h} className={cx("px-1 py-2 font-semibold", i > 0 && "text-right")}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-rule/60 last:border-0">
              {r.map((c, j) => <td key={j} className={cx("px-1 py-2", j > 0 ? "text-right tabular-nums text-ink" : "text-body")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked horizontal bars, one colour. Value printed at the bar's end. */
export function BarList({ rows, color = SERIES.blue, format = String, empty = "Nothing yet" }: {
  rows: { key: string | number; label: string; value: number; note?: string; to?: string }[]; color?: string; format?: (n: number) => string; empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-body group-hover:text-ink">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                {r.note && <span className="mr-2 text-xs text-muted">{r.note}</span>}
                <span className="font-semibold text-ink">{format(r.value)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-cloud">
              {r.value > 0 && <div className="h-2 rounded-full transition-[width] duration-300" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />}
            </div>
          </>
        );
        return <li key={r.key}>{r.to ? <Link to={r.to} className="group block">{body}</Link> : <div className="group">{body}</div>}</li>;
      })}
    </ul>
  );
}

/** Round tick step (1, 2, 2.5 or 5 × 10^n) giving about four gridlines. */
function niceScale(max: number) {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  const n = Math.max(1, Math.ceil(max / step));
  return { top: n * step, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) };
}

/** Vertical columns over time. One or two series side by side; optional target line on the same axis. */
export function ColumnChart({ points, series, format = String, axisFormat, target, height = 180 }: {
  points: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  format?: (n: number) => string; axisFormat?: (n: number) => string;
  target?: { value: number; label: string }; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { top, ticks } = niceScale(Math.max(target?.value ?? 0, ...points.flatMap((p) => p.values)) * 1.08);
  const af = axisFormat ?? format;
  const y = (v: number) => (v / top) * 100;
  const last = points.length - 1;
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-body">
          {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <div className="relative">
        {/* grid + axis */}
        <div className="absolute inset-x-0 top-0" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-0" style={{ bottom: `${y(t)}%` }}>
              <span className="absolute left-0 top-0 w-10 -translate-y-1/2 text-right text-[11px] tabular-nums text-muted">{af(Math.round(t))}</span>
              <div className={cx("absolute left-12 right-0 top-0 h-px", t === 0 ? "bg-rule" : "bg-rule/60")} />
            </div>
          ))}
          {target && (
            <div className="absolute left-12 right-0 h-0" style={{ bottom: `${y(target.value)}%` }}>
              <div className="h-px bg-navy/50" />
              <span className="absolute right-0 -top-5 rounded bg-white/90 px-1 text-[11px] font-semibold text-navy">{target.label}</span>
            </div>
          )}
        </div>
        {/* columns */}
        <div className="relative ml-12 flex" style={{ height }}>
          {points.map((p, i) => (
            <button key={p.label + i} type="button"
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${p.label}: ${p.values.map((v, j) => `${series[j]?.name} ${format(v)}`).join(", ")}`}
              className="relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-md px-1 outline-none hover:bg-ink/[.03] focus-visible:bg-ink/[.05]">
              {p.values.map((v, j) => (
                <span key={j} className="block w-full max-w-[24px] rounded-t-[4px] transition-[height] duration-300"
                  style={{ height: v > 0 ? `max(2px, ${y(v)}%)` : 0, background: series[j]?.color, opacity: hover === null || hover === i ? 1 : 0.55 }} />
              ))}
              {/* label only the latest period; the rest live in the tooltip and table view */}
              {i === last && series.length === 1 && p.values[0] > 0 && hover === null && (
                <span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums text-ink" style={{ bottom: `calc(${y(p.values[0])}% + 4px)` }}>{format(p.values[0])}</span>
              )}
              {hover === i && (
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 min-w-[120px] whitespace-nowrap rounded-lg bg-navy px-3 py-2 text-left text-xs text-white shadow-pop"
                  style={{ left: "50%", transform: `translateX(${i === 0 ? "-20%" : i === last ? "-80%" : "-50%"})` }}>
                  <span className="mb-1 block text-white/70">{p.label}</span>
                  {p.values.map((v, j) => (
                    <span key={j} className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-white/80"><span className="h-0.5 w-3 rounded" style={{ background: series[j]?.color }} />{series[j]?.name}</span>
                      <span className="font-semibold tabular-nums">{format(v)}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-12 flex pt-2">
          {points.map((p, i) => <span key={p.label + i} className="flex-1 text-center text-xs text-muted">{p.label}</span>)}
        </div>
      </div>
    </div>
  );
}

/** Progress toward a target. Fill turns to success once the target is met. */
export function Meter({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "orange" | "danger" | "success" }) {
  const w = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const fill = { blue: "bg-blue", orange: "bg-orange", danger: "bg-danger", success: "bg-success" }[tone];
  const track = { blue: "bg-blue-tint", orange: "bg-orange-tint", danger: "bg-danger-tint", success: "bg-success-tint" }[tone];
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", track)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cx("h-2 rounded-full transition-[width] duration-500", fill)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Number tile: label, value, optional note. Proportional figures for the value. */
export function Stat({ label, value, note, to, tone, className }: { label: string; value: ReactNode; note?: ReactNode; to?: string; tone?: "danger" | "orange" | "success"; className?: string }) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={cx("mt-1 text-[26px] font-extrabold leading-none", tone === "danger" ? "text-danger" : tone === "orange" ? "text-orange-dark" : tone === "success" ? "text-success" : "text-ink")}>{value}</p>
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
    </>
  );
  return to
    ? <Link to={to} className={cx("card block p-4 transition hover:shadow-pop", className)}>{body}</Link>
    : <div className={cx("card p-4", className)}>{body}</div>;
}

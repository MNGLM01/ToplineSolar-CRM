import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FolderKanban, Lock, Search, Timer } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { assignable, useProfiles } from "../lib/queries";
import { daysSince, milestoneProgress, useProjects, useProjectStatuses, type ProjectFilters, type ProjectRow, type ProjectView } from "../lib/projects";
import { DISTRICTS } from "../lib/types";
import { fmtDate } from "../lib/format";
import { Empty, PageHeader, PageLoader, Segmented, StageBadge, cx } from "../components/ui";

export default function Projects() {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const [sp, setSp] = useSearchParams();
  const f: ProjectFilters = {
    view: (sp.get("view") as ProjectView) || "current", q: sp.get("q") ?? "", status: sp.get("status") ?? "",
    district: sp.get("district") ?? "", assigned: sp.get("assigned") ?? "", stuckDays: sp.get("stuck") ?? "",
  };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === "view") n.delete("status"); setSp(n, { replace: true }); };
  const { data: statuses } = useProjectStatuses();
  const { data: profiles } = useProfiles();
  const { data: rows, isLoading, isFetching } = useProjects(f, statuses);
  const statusOf = useMemo(() => Object.fromEntries((statuses ?? []).map((s) => [s.id, s])), [statuses]);
  const viewStatuses = (statuses ?? []).filter((s) =>
    f.view === "finished" ? s.is_completed : f.view === "paused" ? s.is_cancelled || s.name === "On Hold" : !s.is_completed && !s.is_cancelled && s.name !== "On Hold");
  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    rows?.forEach((r) => { c[r.status_id] = (c[r.status_id] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div>
      <PageHeader title="Projects" subtitle={rows ? `${rows.length} ${f.view === "finished" ? "finished" : f.view === "paused" ? "on hold or cancelled" : "in progress"}` : " "}
        actions={<Segmented value={f.view} onChange={(v) => set("view", v)} options={[{ value: "current", label: "Current" }, { value: "finished", label: "Finished" }, { value: "paused", label: "On hold" }]} />} />

      {/* Status pipeline strip (current projects) */}
      {f.view === "current" && !f.status && rows && rows.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {viewStatuses.map((s) => (
            <button key={s.id} onClick={() => set("status", String(s.id))} className="card min-w-[118px] flex-1 px-3 py-2.5 text-left transition hover:border-blue/40">
              <p className="flex items-center gap-1.5 truncate text-xs font-medium text-muted"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</p>
              <p className="text-xl font-extrabold tabular-nums text-ink">{counts[s.id] ?? 0}</p>
            </button>
          ))}
        </div>
      )}

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-10 pl-9" placeholder="Name, village, phone" defaultValue={f.q} onChange={(e) => set("q", e.target.value)} />
        </div>
        <select className="input h-10" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {viewStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input h-10" value={f.district} onChange={(e) => set("district", e.target.value)}>
          <option value="">All districts</option>
          {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        {p.seeAllLeads && (
          <select className="input h-10" value={f.assigned} onChange={(e) => set("assigned", e.target.value)}>
            <option value="">All salespeople</option>
            {assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )}
        {f.view === "current" && (
          <select className="input h-10" value={f.stuckDays} onChange={(e) => set("stuck", e.target.value)}>
            <option value="">Any time in status</option>
            <option value="7">Stuck 7+ days</option>
            <option value="15">Stuck 15+ days</option>
            <option value="30">Stuck 30+ days</option>
          </select>
        )}
      </div>

      {isLoading ? <PageLoader /> : !rows?.length ? (
        <div className="card"><Empty icon={<FolderKanban className="h-6 w-6" />} title={f.view === "finished" ? "No finished projects yet" : "No projects here"}
          text={f.view === "current" ? "Projects start when a won lead is converted to a customer. Open a lead and tap “Convert to customer”." : "Try clearing the filters."} /></div>
      ) : (
        <div className={cx("card divide-y divide-rule/70 transition-opacity", isFetching && "opacity-60")}>
          {rows.map((r) => <ProjectItem key={r.id} r={r} status={statusOf[r.status_id]} view={f.view} />)}
        </div>
      )}
    </div>
  );
}

function ProjectItem({ r, status, view }: { r: ProjectRow; status?: { name: string; color: string }; view: ProjectView }) {
  const prog = milestoneProgress(r.milestones);
  const days = daysSince(r.status_changed_at);
  const stuck = view === "current" && days >= 15;
  return (
    <Link to={`/projects/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-cloud/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-ink">{r.customer.name}</p>
          {r.locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Locked" />}
        </div>
        <p className="truncate text-sm text-muted">
          {r.project_no} · {r.capacity_kw ? `${r.capacity_kw} kW ${r.system_type}` : "size not set"} · {[r.customer.village, r.customer.district].filter(Boolean).join(", ") || "no address"}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-rule/70 sm:w-40">
            <div className="h-full rounded-full bg-orange" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted">{prog.done}/{prog.total} portal steps</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {status && <StageBadge name={status.name} color={status.color} />}
        {view === "finished" ? <span className="text-xs text-muted">{fmtDate(r.completed_on)}</span> : (
          <span className={cx("flex items-center gap-1 text-xs", stuck ? "font-semibold text-danger" : "text-muted")}><Timer className="h-3 w-3" />{days === 0 ? "today" : `${days} d`}</span>
        )}
      </div>
    </Link>
  );
}

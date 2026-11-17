import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, FileCheck2, HardDrive, Inbox, Landmark, Lock, Timer, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { DISTRICTS } from "../lib/types";
import { useDues } from "../lib/money";
import { rupees, rupeesShort } from "../lib/format";
import {
  DASH_PERIODS, FREE_STORAGE_BYTES, INSTALL_TARGET, fmtBytes, monthLabel, pct,
  useDashLeads, useDashMoney, useDashProjects, useStorageUsed, type DashPeriod,
} from "../lib/dashboard";
import { BarList, ChartCard, ColumnChart, DataTable, Meter, SERIES, Stat } from "../components/charts";
import { PageHeader, PageLoader, Segmented, cx } from "../components/ui";

const kw = (n: number) => `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kW`;

export default function Dashboard() {
  const { profile } = useAuth();
  const isOwner = can(profile?.role).seeMoneyTotals;
  const [sp, setSp] = useSearchParams();
  const period = (sp.get("period") as DashPeriod) || "month";
  const district = sp.get("district") ?? "";
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v && !(k === "period" && v === "month")) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const leads = useDashLeads(period, district);
  const projects = useDashProjects(period, district);
  const money = useDashMoney(period, district, isOwner);
  const storage = useStorageUsed(isOwner);
  const { data: newToday } = useQuery({
    queryKey: ["leads", "new-today"],
    queryFn: async () => {
      const sod = new Date(); sod.setHours(0, 0, 0, 0);
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", sod.toISOString());
      return count ?? 0;
    },
  });

  const L = leads.data, P = projects.data, M = money.data;
  const periodLabel = DASH_PERIODS.find((x) => x.value === period)!.label.toLowerCase();
  const refetching = (leads.isFetching && leads.isPlaceholderData) || (projects.isFetching && projects.isPlaceholderData);
  const error = leads.error || projects.error;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={isOwner ? "Leads, projects and money at a glance" : "Leads and projects at a glance"} />

      {/* One filter row scopes everything below it */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto"><Segmented value={period} onChange={(v) => set("period", v)} options={DASH_PERIODS.map((p) => ({ value: p.value, label: p.label }))} /></div>
        <select className="input h-10 w-auto min-w-[150px] py-0 text-sm" value={district} onChange={(e) => set("district", e.target.value)} aria-label="District">
          <option value="">All districts</option>
          {DISTRICTS.filter((d) => d !== "Other").map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      {error ? <p className="card p-6 text-center text-sm text-danger">Couldn't load the dashboard. {String((error as Error).message ?? "")}</p>
        : !L || !P ? <PageLoader /> : (
        <div className={cx("space-y-6 transition-opacity", refetching && "opacity-60")}>
          {/* Needs attention today */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Attention to="/leads" icon={<UserPlus className="h-4 w-4" />} n={newToday ?? 0} label="new leads today" />
            <Attention to="/followups?tab=overdue" icon={<AlertCircle className="h-4 w-4" />} n={L.overdue_followups} label="follow-ups overdue" warn />
            <Attention to="/leads?assigned=none" icon={<Inbox className="h-4 w-4" />} n={L.unassigned} label="leads not assigned" warn />
            <Attention to="/documents" icon={<FileCheck2 className="h-4 w-4" />} n={P.docs_pending} label="documents to check" warn />
            <Attention to="/projects?stuck=15" icon={<Timer className="h-4 w-4" />} n={P.stuck_count} label="projects stuck 15+ days" warn />
          </div>

          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={`New leads, ${periodLabel}`} value={L.new_leads} to="/leads"
              note={L.new_leads ? `${pct(L.won_from_period, L.new_leads)}% of them won so far` : "No new leads yet"} />
            <Stat label={`Leads won, ${periodLabel}`} value={L.won} tone={L.won ? "success" : undefined} note={`${L.open_now} leads still open`} />
            <Stat label="Projects in progress" value={P.current} to="/projects" note={`${kw(P.current_kw)}${P.on_hold ? ` · ${P.on_hold} on hold` : ""}`} />
            <div className="card p-4">
              <p className="text-[13px] font-medium text-muted">Installed this month</p>
              <p className="mt-1 text-[26px] font-extrabold leading-none text-ink">{P.installed_this_month}<span className="ml-1 text-sm font-semibold text-muted">of {INSTALL_TARGET}</span></p>
              <div className="mt-3"><Meter value={P.installed_this_month} max={INSTALL_TARGET} tone={P.installed_this_month >= INSTALL_TARGET ? "success" : "blue"} /></div>
              <p className="mt-1.5 text-xs text-muted">{P.installed_this_month >= INSTALL_TARGET ? "Target reached" : `${INSTALL_TARGET - P.installed_this_month} more to reach the target`}</p>
            </div>
          </div>

          {/* Money: owner only. The office manager never receives these figures from the server. */}
          {isOwner ? <MoneySection m={M} loading={money.isLoading} periodLabel={periodLabel} storage={storage.data} /> : <DuesForManager />}

          {/* Leads */}
          <SectionTitle title="Leads" to="/leads" link="Open leads" />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Where this period's leads are now" subtitle={`${L.new_leads} new leads, by their current stage`}
              table={{ head: ["Stage", "Leads"], rows: L.by_stage.map((s) => [s.name, s.count]) }}>
              <BarList rows={L.by_stage.map((s) => ({ key: s.id, label: s.name, value: s.count, to: `/leads?stage=${s.id}` }))} empty="No leads in this period" />
            </ChartCard>
            <ChartCard title="Which source brings customers" subtitle="Leads and how many were won, by source"
              table={{ head: ["Source", "Leads", "Won", "Converted"], rows: L.by_source.map((s) => [s.name, s.count, s.won, `${pct(s.won, s.count)}%`]) }}>
              <BarList rows={L.by_source.map((s) => ({ key: s.name, label: s.name, value: s.count, note: s.won ? `${s.won} won · ${pct(s.won, s.count)}%` : undefined }))} empty="No leads in this period" />
            </ChartCard>
          </div>

          <section className="card p-4 sm:p-5">
            <h2 className="text-[17px] font-bold">Sales team</h2>
            <p className="mb-3 mt-0.5 text-sm text-muted">New leads given to each person {periodLabel}, follow-ups done and leads won</p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-1 py-2 font-semibold">Name</th>
                  {["New leads", "Open now", "Follow-ups done", "Overdue", "Won", "Converted"].map((h) => <th key={h} className="px-1 py-2 text-right font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {L.team.map((t) => (
                    <tr key={t.id} className="border-b border-rule/60 last:border-0">
                      <td className="px-1 py-2.5"><Link to={`/leads?assigned=${t.id}`} className="font-semibold text-ink hover:text-blue">{t.name}</Link></td>
                      <td className="px-1 text-right tabular-nums text-ink">{t.leads}</td>
                      <td className="px-1 text-right tabular-nums text-ink">{t.open}</td>
                      <td className="px-1 text-right tabular-nums text-ink">{t.followups_done}</td>
                      <td className={cx("px-1 text-right tabular-nums", t.overdue ? "font-semibold text-danger" : "text-ink")}>{t.overdue}</td>
                      <td className="px-1 text-right font-semibold tabular-nums text-ink">{t.won}</td>
                      <td className="px-1 text-right tabular-nums text-ink">{t.leads ? `${pct(t.won, t.leads)}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {L.unassigned > 0 && <Link to="/leads?assigned=none" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue">{L.unassigned} open leads have no salesperson <ChevronRight className="h-4 w-4" /></Link>}
          </section>

          {!district && L.by_district.length > 1 && (
            <ChartCard title="Leads by district" subtitle={`New leads ${periodLabel}`} table={{ head: ["District", "Leads"], rows: L.by_district.map((d) => [d.name, d.count]) }}>
              <BarList rows={L.by_district.map((d) => ({ key: d.name, label: d.name, value: d.count, to: d.name !== "Not set" ? `/leads?district=${encodeURIComponent(d.name)}` : undefined }))} />
            </ChartCard>
          )}

          {/* Projects */}
          <SectionTitle title="Projects" to="/projects" link="Open projects" />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Installations per month" subtitle={`Last 6 months · target ${INSTALL_TARGET} a month`}
              table={{ head: ["Month", "Installed"], rows: P.installs_by_month.map((m) => [monthLabel(m.month), m.count]) }}>
              <ColumnChart points={P.installs_by_month.map((m) => ({ label: monthLabel(m.month), values: [m.count] }))}
                series={[{ name: "Installed", color: SERIES.blue }]} target={{ value: INSTALL_TARGET, label: `Target ${INSTALL_TARGET}` }} />
            </ChartCard>
            <ChartCard title="Current projects by stage" subtitle={`${P.current} in progress · ${kw(P.current_kw)}`}
              table={{ head: ["Stage", "Projects"], rows: P.by_status.map((s) => [s.name, s.count]) }}>
              <BarList rows={P.by_status.map((s) => ({ key: s.id, label: s.name, value: s.count, to: `/projects?status=${s.id}` }))} color={SERIES.navy} empty="No projects in progress" />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4 sm:p-5">
              <h2 className="text-[17px] font-bold">Stuck for 15+ days</h2>
              <p className="mb-2 mt-0.5 text-sm text-muted">No change of stage for 15 days or more</p>
              {P.stuck.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing stuck. Every project moved in the last 15 days.</p> : (
                <ul className="divide-y divide-rule/70">
                  {P.stuck.map((s) => (
                    <li key={s.id}>
                      <Link to={`/projects/${s.id}`} className="flex items-center gap-3 py-2.5 hover:bg-cloud/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{s.customer_name}</p>
                          <p className="text-xs text-muted">{s.project_no} · {s.status}</p>
                        </div>
                        <span className="chip bg-orange-tint text-orange-dark">{s.days} days</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {P.stuck_count > P.stuck.length && <Link to="/projects?stuck=15" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue">See all {P.stuck_count} <ChevronRight className="h-4 w-4" /></Link>}
            </section>

            <section className="card p-4 sm:p-5">
              <h2 className="text-[17px] font-bold">Finished work and paperwork</h2>
              <p className="mb-3 mt-0.5 text-sm text-muted">{DASH_PERIODS.find((x) => x.value === period)!.label}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Figure label="New projects booked" value={P.booked} />
                <Figure label="Installed" value={P.installed} note={kw(P.installed_kw)} />
                <Figure label="Completed" value={P.completed} />
                <Figure label="Subsidy received" value={P.subsidy.received} />
                <Figure label="Subsidy applied, waiting" value={P.subsidy.pending} />
                <Figure label="Installed, subsidy not applied" value={P.subsidy.not_applied} warn={P.subsidy.not_applied > 0} />
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function MoneySection({ m, loading, periodLabel, storage }: { m?: ReturnType<typeof useDashMoney>["data"]; loading: boolean; periodLabel: string; storage?: { files: number; bytes: number } }) {
  if (loading || !m) return <PageLoader />;
  const profit = m.installed_value - m.installed_spend;
  const used = storage ? storage.bytes / FREE_STORAGE_BYTES : 0;
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Money</h2>
        <span className="chip bg-navy/5 text-navy"><Lock className="h-3 w-3" />Only you can see this</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Money received, ${periodLabel}`} value={rupeesShort(m.collections)} note="Customer payments and loans" to="/money?tab=entries" />
        <Stat label={`Sales booked, ${periodLabel}`} value={rupeesShort(m.sales_booked)} note={`New projects · ${kw(m.sales_booked_kw)}`} />
        <Stat label={`Money spent, ${periodLabel}`} value={rupeesShort(m.money_out)}
          note={`Projects ${rupeesShort(m.project_spend)} · office ${rupeesShort(m.office_expenses)}`} to="/money?tab=entries" />
        <Stat label="Profit on installed projects" value={m.installed_value ? rupeesShort(profit) : "–"} tone={profit < 0 ? "danger" : undefined}
          note={m.installed_value ? `${pct(profit, m.installed_value)}% margin on ${rupeesShort(m.installed_value)}` : `No installations ${periodLabel}`} />
        <Stat label="Pending dues, all customers" value={rupeesShort(m.pending_dues)} tone={m.pending_dues ? "orange" : undefined} to="/money" />
        <Stat label="Subsidy waiting" value={rupeesShort(m.subsidy_pending_amount)} note="Applied, not yet received" />
        <Stat label="Commission to pay" value={rupeesShort(Math.max(0, m.commissions_due))} to="/money?tab=commissions" />
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted"><HardDrive className="h-3.5 w-3.5" />File storage</p>
          <p className="mt-1 text-[26px] font-extrabold leading-none text-ink">{storage ? fmtBytes(storage.bytes) : "–"}</p>
          <div className="mt-3"><Meter value={used * 100} max={100} tone={used > 0.9 ? "danger" : used > 0.7 ? "orange" : "blue"} /></div>
          <p className="mt-1.5 text-xs text-muted">{storage ? `${Math.round(used * 100)}% of the free 1 GB · ${storage.files} files` : "Checking…"}</p>
        </div>
      </div>
      <ChartCard title="Money in and out" subtitle="Last 6 months"
        table={{ head: ["Month", "Received", "Spent", "Booked"], rows: m.by_month.map((x) => [monthLabel(x.month), rupees(x.in), rupees(x.out), rupees(x.booked)]) }}>
        <ColumnChart points={m.by_month.map((x) => ({ label: monthLabel(x.month), values: [x.in, x.out] }))}
          series={[{ name: "Received", color: SERIES.blue }, { name: "Spent", color: SERIES.orange }]} format={rupees} axisFormat={axisRupees} />
      </ChartCard>
    </>
  );
}

const axisRupees = (n: number) => (n >= 1e7 ? `${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** Office manager: each customer's own dues, no totals. */
function DuesForManager() {
  const { data } = useDues();
  const rows = (data ?? []).filter((d) => d.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 8);
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <div><h2 className="text-[17px] font-bold">Customers with payment due</h2><p className="mt-0.5 text-sm text-muted">Largest dues first</p></div>
        <Landmark className="h-5 w-5 text-muted" />
      </div>
      {!data ? <PageLoader /> : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">No pending dues.</p> : (
        <DataTable head={["Customer", "Project", "Due"]} rows={rows.map((d) => [d.customer_name, d.project_no, rupees(d.pending)])} />
      )}
      <Link to="/money" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue">All dues <ChevronRight className="h-4 w-4" /></Link>
    </section>
  );
}

function SectionTitle({ title, to, link }: { title: string; to: string; link: string }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-blue">{link}<ChevronRight className="h-4 w-4" /></Link>
    </div>
  );
}

function Attention({ to, icon, n, label, warn }: { to: string; icon: ReactNode; n: number; label: string; warn?: boolean }) {
  const hot = warn && n > 0;
  return (
    <Link to={to} className={cx("flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition hover:shadow-card",
      hot ? "border-orange/30 bg-orange-tint text-orange-dark" : "border-rule bg-white text-body")}>
      {icon}<span className={cx("font-bold tabular-nums", hot ? "text-orange-dark" : "text-ink")}>{n}</span>{label}
    </Link>
  );
}

function Figure({ label, value, note, warn }: { label: string; value: number; note?: string; warn?: boolean }) {
  return (
    <div>
      <p className={cx("text-xl font-extrabold leading-tight", warn ? "text-orange-dark" : "text-ink")}>{value}</p>
      <p className="text-xs text-muted">{label}{note ? ` · ${note}` : ""}</p>
    </div>
  );
}

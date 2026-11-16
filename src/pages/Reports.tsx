import { useState } from "react";
import { Download, FileSpreadsheet, Lock, PackageOpen } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { useProfiles } from "../lib/queries";
import { PERIODS, periodRange, today } from "../lib/money";
import { downloadExcel, reportsFor, type Ctx, type ReportDef } from "../lib/reports";
import { Button, PageHeader, Segmented, cx, friendlyError, useToast } from "../components/ui";

const REPORT_PERIODS = [PERIODS[0], { value: "3m", label: "Last 3 months" }, PERIODS[2], PERIODS[3]];

export default function Reports() {
  const { profile } = useAuth();
  const isOwner = can(profile?.role).seeMoneyTotals;
  const { data: profiles } = useProfiles();
  const toast = useToast();
  const [period, setPeriod] = useState("month");
  const [busy, setBusy] = useState<string | null>(null);
  const list = reportsFor(isOwner);
  const periodLabel = REPORT_PERIODS.find((p) => p.value === period)!.label;

  const ctx = (): Ctx => { const [from, to] = periodRange(period); return { from, to, isOwner, profiles: profiles ?? [] }; };
  const stamp = () => `${period === "all" ? "all-time" : periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${today()}`;

  async function one(r: ReportDef) {
    setBusy(r.id);
    try {
      const sheet = await r.build(ctx());
      await downloadExcel([sheet], `Topline-${r.title.replace(/[^A-Za-z0-9]+/g, "-")}-${r.usesPeriod ? stamp() : today()}.xlsx`);
      toast(`${r.title} downloaded`);
    } catch (e) { toast(friendlyError(e), "error"); } finally { setBusy(null); }
  }

  async function everything() {
    setBusy("all");
    try {
      const c = ctx();
      const sheets = await Promise.all(list.map((r) => r.build(c)));
      await downloadExcel(sheets, `Topline-CRM-export-${stamp()}.xlsx`);
      toast("Everything downloaded in one Excel file");
    } catch (e) { toast(friendlyError(e), "error"); } finally { setBusy(null); }
  }

  const groups = (["Leads", "Projects", "Money"] as const).map((g) => ({ g, items: list.filter((r) => r.group === g) }));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Download any report as an Excel file" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto"><Segmented value={period} onChange={setPeriod} options={REPORT_PERIODS.map((p) => ({ value: p.value, label: p.label }))} /></div>
      </div>

      <section className="card mb-6 flex flex-col gap-3 bg-navy p-5 text-white sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><PackageOpen className="h-6 w-6 text-amber" /></span>
        <div className="flex-1">
          <h2 className="text-[17px] font-bold text-white">Export everything</h2>
          <p className="text-sm text-white/70">All {list.length} reports in one Excel file, one sheet each. Keep a copy every week as a backup.</p>
        </div>
        <Button onClick={everything} loading={busy === "all"} disabled={!!busy || !profiles}><Download className="h-4 w-4" />Download all</Button>
      </section>

      <div className="space-y-6">
        {groups.map(({ g, items }) => (
          <section key={g}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{g}</h2>
            <div className="card divide-y divide-rule/70">
              {items.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx("hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex", r.ownerOnly ? "bg-navy/5 text-navy" : "bg-success-tint text-success")}>
                    <FileSpreadsheet className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 font-semibold text-ink">
                      {r.title}
                      {r.ownerOnly && <span className="chip h-5 bg-navy/5 px-2 text-[11px] text-navy"><Lock className="h-3 w-3" />Only you</span>}
                    </p>
                    <p className="text-sm text-muted">{r.text}{r.usesPeriod ? ` · ${periodLabel.toLowerCase()}` : " · as of today"}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => one(r)} loading={busy === r.id} disabled={!!busy || !profiles} aria-label={`Download ${r.title}`}>
                    <Download className="h-4 w-4" /><span className="hidden sm:inline">Excel</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

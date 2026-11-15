import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, Inbox, Trophy, Plus, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { useFollowupCounts, useFollowups } from "../lib/followups";
import { useStages } from "../lib/queries";
import { Button, PageLoader, cx } from "../components/ui";
import { FollowupList } from "../components/FollowupList";

export default function Today() {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const { openNewLead } = useOutletContext<{ openNewLead: () => void }>();
  const mine = p.seeAllLeads ? undefined : profile?.id;
  const { data: counts } = useFollowupCounts(mine);
  const { data: overdue } = useFollowups("overdue", mine);
  const { data: today, isLoading } = useFollowups("today", mine);
  const { data: stages } = useStages();

  const { data: stats } = useQuery({
    queryKey: ["leads", "today-stats", profile?.id],
    queryFn: async () => {
      const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
      const won = stages?.find((s) => s.is_won)?.id ?? -1;
      const lost = stages?.find((s) => s.is_lost)?.id ?? -1;
      const base = () => supabase.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null);
      const [unassigned, newMonth, wonMonth, open, byStage] = await Promise.all([
        p.assignLeads ? base().is("assigned_to", null).not("stage_id", "in", `(${won},${lost})`) : Promise.resolve({ count: 0 }),
        base().gte("created_at", som.toISOString()),
        base().eq("stage_id", won).gte("won_at", som.toISOString()),
        base().not("stage_id", "in", `(${won},${lost})`),
        supabase.from("leads").select("stage_id").is("deleted_at", null).limit(5000),
      ]);
      const stageCounts: Record<number, number> = {};
      (byStage.data ?? []).forEach((r: { stage_id: number }) => { stageCounts[r.stage_id] = (stageCounts[r.stage_id] ?? 0) + 1; });
      return { unassigned: unassigned.count ?? 0, newMonth: newMonth.count ?? 0, wonMonth: wonMonth.count ?? 0, open: open.count ?? 0, stageCounts };
    },
    enabled: !!stages,
  });

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const maxStage = Math.max(1, ...Object.values(stats?.stageCounts ?? { 0: 1 }));
  const funnel = stages?.filter((s) => s.active && !s.is_lost) ?? [];

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-extrabold">{greet}, {profile?.full_name.split(" ")[0]}</h1>
          <span className="baseline mt-2" />
        </div>
        <Button onClick={openNewLead} className="hidden sm:inline-flex"><Plus className="h-4 w-4" />New lead</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile to="/followups?tab=overdue" icon={<AlertCircle className="h-5 w-5" />} label="Overdue follow-ups" value={counts?.overdue} tone={counts?.overdue ? "danger" : "muted"} />
        <Tile to="/followups?tab=today" icon={<CalendarClock className="h-5 w-5" />} label="Due today" value={counts?.today} tone="blue" />
        {p.assignLeads
          ? <Tile to="/leads?assigned=none" icon={<Inbox className="h-5 w-5" />} label="New leads not assigned" value={stats?.unassigned} tone={stats?.unassigned ? "orange" : "muted"} />
          : <Tile to="/leads" icon={<Inbox className="h-5 w-5" />} label="My open leads" value={stats?.open} tone="orange" />}
        <Tile to="/leads" icon={<Trophy className="h-5 w-5" />} label="Won this month" value={stats?.wonMonth} tone="success" sub={`${stats?.newMonth ?? "–"} new leads this month`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card px-4 pt-4 lg:col-span-2">
          <h2 className="text-lg font-bold">Your calls and visits today</h2>
          <p className="text-sm text-muted">Overdue first, then today's. Tap a name to open the lead.</p>
          {isLoading ? <PageLoader /> : <FollowupList rows={[...(overdue ?? []), ...(today ?? [])]} showOwner={p.seeAllLeads} emptyText="You're all caught up. Add a lead or schedule follow-ups from a lead's page." />}
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-lg font-bold">Leads by stage</h2>
          <ul className="space-y-2.5">
            {funnel.map((s) => {
              const n = stats?.stageCounts[s.id] ?? 0;
              return (
                <li key={s.id}>
                  <Link to={`/leads?stage=${s.id}`} className="group block">
                    <div className="mb-1 flex justify-between text-sm"><span className="text-body group-hover:text-ink">{s.name}</span><span className="font-semibold tabular-nums text-ink">{n}</span></div>
                    <div className="h-2 rounded-full bg-cloud"><div className="h-2 rounded-full transition-all" style={{ width: `${(n / maxStage) * 100}%`, background: s.color }} /></div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link to="/leads?view=board" className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue">Open board <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
}

function Tile({ to, icon, label, value, tone, sub }: { to: string; icon: ReactNode; label: string; value?: number; tone: "danger" | "blue" | "orange" | "success" | "muted"; sub?: string }) {
  const t = { danger: "bg-danger-tint text-danger", blue: "bg-blue-tint text-blue", orange: "bg-orange-tint text-orange-dark", success: "bg-success-tint text-success", muted: "bg-cloud text-muted" }[tone];
  return (
    <Link to={to} className="card flex flex-col gap-3 p-4 transition hover:shadow-pop">
      <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", t)}>{icon}</span>
      <div>
        <p className="text-2xl font-extrabold tabular-nums text-ink">{value ?? "–"}</p>
        <p className="text-sm text-muted">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
    </Link>
  );
}

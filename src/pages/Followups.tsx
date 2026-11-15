import { useSearchParams } from "react-router-dom";
import { can, useAuth } from "../lib/auth";
import { useFollowupCounts, useFollowups } from "../lib/followups";
import { assignable, useProfiles } from "../lib/queries";
import { PageHeader, PageLoader, cx } from "../components/ui";
import { FollowupList } from "../components/FollowupList";

const TABS = [
  { key: "overdue", label: "Overdue" }, { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" }, { key: "done", label: "Done" },
] as const;

export default function Followups() {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as (typeof TABS)[number]["key"]) || "today";
  const who = p.seeAllLeads ? params.get("who") ?? "" : profile?.id;
  const { data: profiles } = useProfiles();
  const { data, isLoading } = useFollowups(tab, who || undefined);
  const { data: counts } = useFollowupCounts(who || undefined);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  return (
    <div>
      <PageHeader title="Follow-ups" subtitle={p.seeAllLeads ? "Everyone's follow-ups" : "Your follow-ups"}
        actions={p.seeAllLeads && (
          <select className="input h-10 w-48 text-sm" value={who ?? ""} onChange={(e) => set("who", e.target.value)}>
            <option value="">Everyone</option>
            {assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )} />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-ink/5 p-1">
        {TABS.map((t) => {
          const n = t.key === "done" ? null : counts?.[t.key];
          return (
            <button key={t.key} onClick={() => set("tab", t.key)}
              className={cx("flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition", tab === t.key ? "bg-white text-ink shadow-sm" : "text-muted")}>
              {t.label}
              {n != null && n > 0 && <span className={cx("rounded-full px-1.5 text-[11px]", t.key === "overdue" ? "bg-danger text-white" : "bg-ink/10 text-ink")}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="card px-4">
        {isLoading ? <PageLoader /> : <FollowupList rows={data ?? []} showOwner={p.seeAllLeads && !who} done={tab === "done"}
          emptyText={tab === "overdue" ? "No overdue follow-ups. Well done." : tab === "today" ? "Nothing else due today." : tab === "upcoming" ? "Nothing scheduled ahead." : "No completed follow-ups yet."} />}
      </div>
    </div>
  );
}

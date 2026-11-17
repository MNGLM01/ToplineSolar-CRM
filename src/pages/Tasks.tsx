import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListChecks, Plus } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { assignable, useProfiles } from "../lib/queries";
import { BUCKET_LABEL, dueBucket, useTasks, type DueBucket, type TaskRow } from "../lib/tasks";
import { Button, Empty, PageHeader, PageLoader, cx } from "../components/ui";
import { TaskList } from "../components/tasks/TaskList";
import { TaskSheet } from "../components/tasks/TaskSheet";

type Tab = "mine" | "all" | "done";

export default function Tasks() {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "mine";
  const who = sp.get("who") ?? "";
  const { data: profiles } = useProfiles();
  const { data: rows, isLoading } = useTasks(tab, profile?.id, tab === "all" ? who : undefined);
  const [sheet, setSheet] = useState<{ edit?: TaskRow } | null>(null);

  const groups = useMemo(() => {
    const g: Record<DueBucket, TaskRow[]> = { overdue: [], today: [], upcoming: [], someday: [] };
    (rows ?? []).forEach((t) => g[dueBucket(t)].push(t));
    // urgent first inside each group
    (Object.keys(g) as DueBucket[]).forEach((k) => g[k].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1)));
    return g;
  }, [rows]);

  const tabs: [Tab, string][] = [["mine", "My tasks"], ...(p.assignLeads ? [["all", "Everyone"] as [Tab, string]] : []), ["done", "Done"]];
  const setTab = (t: Tab) => setSp(t === "mine" ? {} : { tab: t }, { replace: true });

  return (
    <div>
      <PageHeader title="Tasks" subtitle={tab === "done" ? "Finished tasks" : rows ? `${rows.length} to do` : " "}
        actions={<Button onClick={() => setSheet({})}><Plus className="h-4 w-4" />New task</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-xl bg-ink/5 p-1 sm:flex-none">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cx("h-9 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none", tab === k ? "bg-white text-ink shadow-sm" : "text-muted")}>{l}</button>
          ))}
        </div>
        {tab === "all" && (
          <select className="input h-10 w-auto py-0 text-sm" value={who} aria-label="Person"
            onChange={(e) => setSp(e.target.value ? { tab: "all", who: e.target.value } : { tab: "all" }, { replace: true })}>
            <option value="">Everyone</option>
            {assignable(profiles).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
          </select>
        )}
      </div>

      {isLoading ? <PageLoader /> : !rows?.length ? (
        <div className="card">
          <Empty icon={<ListChecks className="h-6 w-6" />} title={tab === "done" ? "Nothing finished yet" : "No tasks to do"}
            text={tab === "done" ? undefined : "Add a task for anything that must not be forgotten: collect a document, visit a site, call the DISCOM office."}
            action={tab !== "done" ? <Button onClick={() => setSheet({})}><Plus className="h-4 w-4" />New task</Button> : undefined} />
        </div>
      ) : tab === "done" ? (
        <div className="card px-4"><TaskList rows={rows} showAssignee={p.assignLeads} onOpen={(t) => setSheet({ edit: t })} /></div>
      ) : (
        <div className="space-y-4">
          {(["overdue", "today", "upcoming", "someday"] as DueBucket[]).filter((b) => groups[b].length).map((b) => (
            <section key={b} className="card px-4 pt-3">
              <h2 className={cx("text-sm font-bold", b === "overdue" ? "text-danger" : b === "today" ? "text-orange-dark" : "text-ink")}>
                {BUCKET_LABEL[b]} <span className="font-medium text-muted">· {groups[b].length}</span>
              </h2>
              <TaskList rows={groups[b]} showAssignee={tab === "all"} onOpen={(t) => setSheet({ edit: t })} />
            </section>
          ))}
        </div>
      )}
      <TaskSheet open={!!sheet} onClose={() => setSheet(null)} edit={sheet?.edit} />
    </div>
  );
}

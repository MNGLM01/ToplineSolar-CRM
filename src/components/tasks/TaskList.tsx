import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Flag, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useProfiles } from "../../lib/queries";
import { dueBucket, useTasksFor, type TaskRow } from "../../lib/tasks";
import { fmtDate } from "../../lib/format";
import { Button, cx, friendlyError, useToast } from "../ui";
import { TaskSheet, type TaskPreset } from "./TaskSheet";

const dueText = (t: TaskRow) => {
  const b = dueBucket(t);
  if (t.status === "done") return { text: `Done ${fmtDate(t.done_at)}`, cls: "text-muted" };
  if (b === "overdue") return { text: `Overdue · ${fmtDate(t.due_on)}`, cls: "text-danger font-semibold" };
  if (b === "today") return { text: "Today", cls: "text-orange-dark font-semibold" };
  if (b === "upcoming") return { text: fmtDate(t.due_on), cls: "text-muted" };
  return { text: "No date", cls: "text-muted" };
};

/** One row per task: tick to finish, tap to open. */
export function TaskList({ rows, showAssignee, showLink = true, onOpen }: { rows: TaskRow[]; showAssignee?: boolean; showLink?: boolean; onOpen: (t: TaskRow) => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const { data: profiles } = useProfiles();
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? "";
  const [ticking, setTicking] = useState<string | null>(null);

  async function toggle(t: TaskRow) {
    setTicking(t.id);
    const { error } = await supabase.from("tasks").update({ status: t.status === "done" ? "open" : "done" }).eq("id", t.id);
    setTicking(null);
    if (error) { toast(friendlyError(error), "error"); return; }
    if (t.status === "open") toast("Done. Nice work.");
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <ul className="divide-y divide-rule/70">
      {rows.map((t) => {
        const d = dueText(t);
        const done = t.status === "done";
        return (
          <li key={t.id} className="flex items-start gap-3 py-2.5">
            <button onClick={() => toggle(t)} disabled={ticking === t.id} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`}
              className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                done ? "border-success bg-success text-white" : "border-rule hover:border-success", ticking === t.id && "opacity-50")}>
              {(done || ticking === t.id) && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
            <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
              <p className={cx("text-[15px] font-medium", done ? "text-muted line-through" : "text-ink")}>
                {t.priority === "high" && !done && <Flag className="-mt-0.5 mr-1 inline h-3.5 w-3.5 text-danger" aria-label="Urgent" />}
                {t.title}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                <span className={d.cls}>{d.text}</span>
                {showAssignee && <span className="text-muted">· {nameOf(t.assigned_to)}</span>}
              </p>
            </button>
            {showLink && (t.lead || t.project) && (
              <Link to={t.project ? `/projects/${t.project.id}` : `/leads/${t.lead!.id}`} className="max-w-[40%] shrink-0 truncate rounded-lg bg-cloud px-2 py-1 text-xs font-medium text-body hover:text-ink">
                {t.project ? t.project.customer?.name ?? t.project.project_no : t.lead!.name}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Tasks linked to one lead or project, with an Add button. */
export function TasksCard({ preset }: { preset: TaskPreset }) {
  const { data } = useTasksFor({ leadId: preset.leadId, projectId: preset.project?.id });
  const [sheet, setSheet] = useState<{ edit?: TaskRow } | null>(null);
  const open = (data ?? []).filter((t) => t.status === "open");
  const done = (data ?? []).filter((t) => t.status === "done").slice(0, 3);
  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[17px] font-bold">Tasks</h2>
        <Button size="sm" variant="secondary" onClick={() => setSheet({})}><Plus className="h-4 w-4" />Add</Button>
      </div>
      {data && data.length === 0 && <p className="py-3 text-sm text-muted">No tasks yet. Add one so nothing is forgotten.</p>}
      <TaskList rows={[...open, ...done]} showAssignee showLink={false} onOpen={(t) => setSheet({ edit: t })} />
      <TaskSheet open={!!sheet} onClose={() => setSheet(null)} preset={preset} edit={sheet?.edit} />
    </section>
  );
}

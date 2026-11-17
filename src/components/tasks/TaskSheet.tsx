import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flag, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { can, useAuth } from "../../lib/auth";
import { assignable, useProfiles } from "../../lib/queries";
import { today } from "../../lib/money";
import { addDays, type TaskRow } from "../../lib/tasks";
import { fmtDate } from "../../lib/format";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "../ui";
import { ProjectPicker, type PickedProject } from "../money/ProjectPicker";

export interface TaskPreset { leadId?: string; leadName?: string; project?: PickedProject | null; title?: string }

const QUICK = [{ label: "Today", d: 0 }, { label: "Tomorrow", d: 1 }, { label: "In 3 days", d: 3 }, { label: "Next week", d: 7 }];

/** Add or edit a to-do. Sales add tasks for themselves; the owner and office manager can give tasks to anyone. */
export function TaskSheet({ open, onClose, preset, edit }: { open: boolean; onClose: () => void; preset?: TaskPreset; edit?: TaskRow | null }) {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const { data: profiles } = useProfiles();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ title: "", note: "", due: today(), priority: "normal" as "normal" | "high", assignee: "" });
  const [project, setProject] = useState<PickedProject | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (edit) {
      setF({ title: edit.title, note: edit.note ?? "", due: edit.due_on ?? "", priority: edit.priority, assignee: edit.assigned_to });
      setProject(edit.project ? { id: edit.project.id, project_no: edit.project.project_no, customer_name: edit.project.customer?.name ?? "" } : null);
    } else {
      setF({ title: preset?.title ?? "", note: "", due: today(), priority: "normal", assignee: profile?.id ?? "" });
      setProject(preset?.project ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit?.id]);

  const leadId = edit ? edit.lead_id : preset?.leadId;
  const leadName = edit ? edit.lead?.name : preset?.leadName;
  const canEditAll = !edit || p.assignLeads || edit.created_by === profile?.id || edit.assigned_to === profile?.id;
  const canDelete = !!edit && (p.assignLeads || edit.created_by === profile?.id);

  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  async function save() {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "What needs to be done?";
    if (!f.assignee) e.assignee = "Choose who will do it";
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const row = {
      title: f.title.trim(), note: f.note.trim() || null, due_on: f.due || null, priority: f.priority,
      assigned_to: p.assignLeads ? f.assignee : edit?.assigned_to ?? profile!.id,
      lead_id: leadId ?? null, project_id: project?.id ?? null,
    };
    const res = edit ? await supabase.from("tasks").update(row).eq("id", edit.id) : await supabase.from("tasks").insert(row);
    setBusy(false);
    if (res.error) { toast(friendlyError(res.error), "error"); return; }
    toast(edit ? "Task updated" : "Task added"); refresh(); onClose();
  }

  async function setStatus(status: "open" | "done") {
    if (!edit) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").update({ status }).eq("id", edit.id);
    setBusy(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    toast(status === "done" ? "Marked done" : "Task reopened"); refresh(); onClose();
  }

  async function remove() {
    if (!edit || !confirm("Delete this task?")) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", edit.id);
    setBusy(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    toast("Task deleted"); refresh(); onClose();
  }

  const people = assignable(profiles);
  return (
    <Sheet open={open} onClose={onClose} title={edit ? "Task" : "New task"}
      footer={
        <>
          {canDelete && <Button variant="danger" onClick={remove} disabled={busy} aria-label="Delete task"><Trash2 className="h-4 w-4" /></Button>}
          {edit && (edit.status === "open"
            ? <Button variant="secondary" onClick={() => setStatus("done")} disabled={busy}><CheckCircle2 className="h-4 w-4 text-success" />Done</Button>
            : <Button variant="secondary" onClick={() => setStatus("open")} disabled={busy}><RotateCcw className="h-4 w-4" />Reopen</Button>)}
          {canEditAll && <Button className="flex-1" loading={busy} onClick={save}>{edit ? "Save changes" : "Add task"}</Button>}
        </>
      }>
      <div className="space-y-4">
        {edit?.status === "done" && <p className="rounded-xl bg-success-tint px-3 py-2 text-sm font-medium text-success">Done on {fmtDate(edit.done_at)}</p>}
        <Field label="What needs to be done?" error={errors.title}>
          <input className="input" autoFocus={!edit} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Collect electricity bill from customer" />
        </Field>
        <div>
          <span className="label">When?</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => {
              const d = addDays(q.d);
              return <button key={q.label} type="button" onClick={() => setF({ ...f, due: d })}
                className={cx("chip h-8 border px-3 text-[13px]", f.due === d ? "border-navy bg-navy text-white" : "border-rule bg-white text-body")}>{q.label}</button>;
            })}
            <button type="button" onClick={() => setF({ ...f, due: "" })}
              className={cx("chip h-8 border px-3 text-[13px]", !f.due ? "border-navy bg-navy text-white" : "border-rule bg-white text-body")}>No date</button>
          </div>
          <input type="date" className="input" value={f.due} min={edit ? undefined : today()} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label="Due date" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {p.assignLeads ? (
            <Field label="Who will do it?" error={errors.assignee}>
              <select className="input" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
                <option value="">Choose…</option>
                {people.map((x) => <option key={x.id} value={x.id}>{x.id === profile?.id ? `${x.full_name} (me)` : x.full_name}</option>)}
              </select>
            </Field>
          ) : <div />}
          <div>
            <span className="label">Priority</span>
            <button type="button" onClick={() => setF({ ...f, priority: f.priority === "high" ? "normal" : "high" })} aria-pressed={f.priority === "high"}
              className={cx("flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[15px] font-semibold",
                f.priority === "high" ? "border-danger/40 bg-danger-tint text-danger" : "border-rule bg-white text-body")}>
              <Flag className="h-4 w-4" />{f.priority === "high" ? "Urgent" : "Normal"}
            </button>
          </div>
        </div>
        {leadId ? (
          <div><span className="label">For lead</span><p className="flex h-11 items-center rounded-xl bg-cloud px-3.5 text-[15px] font-medium text-ink">{leadName ?? "This lead"}</p></div>
        ) : (
          <div><span className="label">For which project? (optional)</span><ProjectPicker value={project} onChange={setProject} /></div>
        )}
        <Field label="Note (optional)"><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}

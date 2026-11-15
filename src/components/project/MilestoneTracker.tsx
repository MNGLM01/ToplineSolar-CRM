import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { MILESTONES, type Milestone } from "../../lib/projects";
import { fmtDate } from "../../lib/format";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "../ui";

const STATUS_LABEL = { pending: "Not started", in_progress: "In progress", done: "Done", not_needed: "Not needed" } as const;

export function useMilestones(projectId: string) {
  return useQuery({
    queryKey: ["milestones", projectId],
    queryFn: async () => (await supabase.from("project_milestones").select("*").eq("project_id", projectId).order("step")).data as Milestone[],
  });
}

/** PM Surya Ghar 10-step tracker. Tap a step to update it. */
export function MilestoneTracker({ projectId, locked }: { projectId: string; locked: boolean }) {
  const { data: ms } = useMilestones(projectId);
  const [edit, setEdit] = useState<Milestone | null>(null);
  const done = ms?.filter((m) => m.status === "done").length ?? 0;
  const counted = ms?.filter((m) => m.status !== "not_needed").length ?? 10;
  const current = ms?.find((m) => m.status !== "done" && m.status !== "not_needed");

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-bold">PM Surya Ghar steps</h3>
        <span className="text-sm font-semibold tabular-nums text-ink">{done}/{counted}</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-rule/70"><div className="h-full rounded-full bg-orange transition-all" style={{ width: `${(done / (counted || 1)) * 100}%` }} /></div>
      <ol className="relative">
        {MILESTONES.map((def, i) => {
          const m = ms?.find((x) => x.step === def.step);
          const st = m?.status ?? "pending";
          const isCurrent = current?.step === def.step;
          return (
            <li key={def.step} className="relative flex gap-3 pb-1">
              {i < MILESTONES.length - 1 && <span className={cx("absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5", st === "done" ? "bg-orange" : "bg-rule")} />}
              <span className={cx("relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                st === "done" ? "border-orange bg-orange text-white" : st === "not_needed" ? "border-rule bg-cloud text-muted" : st === "in_progress" || isCurrent ? "border-blue bg-white text-blue" : "border-rule bg-white text-muted")}>
                {st === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : st === "not_needed" ? <Minus className="h-3.5 w-3.5" /> : def.step}
              </span>
              <button disabled={locked || !m} onClick={() => m && setEdit(m)}
                className={cx("-mx-2 mb-1 flex min-w-0 flex-1 items-start justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition", !locked && "hover:bg-cloud", isCurrent && "bg-blue-tint/60")}>
                <span className="min-w-0">
                  <span className={cx("block text-[15px] font-semibold", st === "not_needed" ? "text-muted line-through" : "text-ink")}>{def.name}</span>
                  <span className="block text-xs text-muted">{m?.note || def.hint}</span>
                </span>
                <span className={cx("shrink-0 pt-0.5 text-xs", st === "done" ? "font-medium text-ink" : st === "in_progress" ? "font-semibold text-blue" : "text-muted")}>
                  {st === "done" ? fmtDate(m?.done_on) : st === "in_progress" ? "In progress" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <MilestoneSheet m={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function MilestoneSheet({ m, onClose }: { m: Milestone | null; onClose: () => void }) {
  const [status, setStatus] = useState<Milestone["status"]>("pending");
  const [date, setDate] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  const qc = useQueryClient(); const toast = useToast();
  if (m && openedFor !== m.id) {
    setOpenedFor(m.id); setStatus(m.status); setDate(m.done_on ?? new Date().toISOString().slice(0, 10)); setNote(m.note ?? "");
  }
  if (!m) return null;
  const def = MILESTONES[m.step - 1];
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("project_milestones").update({ status, done_on: status === "done" ? date || null : null, note: note.trim() || null }).eq("id", m!.id);
    setBusy(false);
    if (error) return toast(friendlyError(error), "error");
    qc.invalidateQueries({ queryKey: ["milestones", m!.project_id] }); qc.invalidateQueries({ queryKey: ["projects"] });
    toast(`${def.name}: ${STATUS_LABEL[status]}`); setOpenedFor(null); onClose();
  }
  return (
    <Sheet open onClose={() => { setOpenedFor(null); onClose(); }} title={`Step ${m.step}: ${def.name}`}
      footer={<Button className="flex-1" loading={busy} onClick={save}>Save</Button>}>
      <p className="mb-4 text-sm text-muted">{def.hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(STATUS_LABEL) as Milestone["status"][]).map((k) => (
          <button key={k} onClick={() => setStatus(k)} className={cx("h-11 rounded-xl border text-sm font-semibold transition",
            status === k ? (k === "done" ? "border-orange bg-orange-tint text-orange-dark" : k === "in_progress" ? "border-blue bg-blue-tint text-blue" : "border-ink/30 bg-cloud text-ink") : "border-rule text-muted")}>{STATUS_LABEL[k]}</button>
        ))}
      </div>
      {status === "done" && <Field label="Date done" className="mt-4"><input type="date" className="input" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></Field>}
      <Field label="Note (optional)" className="mt-4"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Application number, DISCOM officer, anything useful" /></Field>
    </Sheet>
  );
}

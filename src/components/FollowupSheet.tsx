import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { toLocalInput } from "../lib/format";
import { FOLLOWUP_TYPES } from "../lib/types";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "./ui";

const quick = () => {
  const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const later = new Date(Date.now() + 2 * 3600_000); later.setMinutes(0, 0, 0);
  return [
    { label: "In 2 hours", d: later }, { label: "Tomorrow 10 am", d: at(1, 10) },
    { label: "In 3 days", d: at(3, 10) }, { label: "Next week", d: at(7, 10) },
  ];
};

export function FollowupSheet({ open, onClose, leadId, leadName, title: heading = "Schedule follow-up" }: { open: boolean; onClose: () => void; leadId: string; leadName: string; title?: string }) {
  const [type, setType] = useState<string>("call");
  const [due, setDue] = useState(toLocalInput(quick()[1].d));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  async function save() {
    setSaving(true);
    const label = FOLLOWUP_TYPES.find((t) => t.value === type)!.label;
    const { error } = await supabase.from("followups").insert({ lead_id: leadId, type, title: `${label} · ${leadName}`, note: note || null, due_at: new Date(due).toISOString() });
    if (!error) await supabase.from("lead_activities").insert({ lead_id: leadId, type: "followup", body: `${label} scheduled for ${new Date(due).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${note ? ` · ${note}` : ""}` });
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    ["followups", "leads", "lead", "activities"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Follow-up scheduled"); setNote(""); onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={heading}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} loading={saving}>Schedule</Button></>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FOLLOWUP_TYPES.map((t) => (
            <button key={t.value} onClick={() => setType(t.value)} className={cx("h-11 rounded-xl border text-sm font-semibold transition", type === t.value ? "border-orange bg-orange-tint text-orange-dark" : "border-rule text-body")}>{t.label}</button>
          ))}
        </div>
        <div>
          <span className="label">When</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {quick().map((q) => (
              <button key={q.label} onClick={() => setDue(toLocalInput(q.d))} className={cx("chip h-8 border", due === toLocalInput(q.d) ? "border-blue bg-blue-tint text-blue" : "border-rule text-body")}>{q.label}</button>
            ))}
          </div>
          <input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Discuss subsidy and EMI" /></Field>
      </div>
    </Sheet>
  );
}

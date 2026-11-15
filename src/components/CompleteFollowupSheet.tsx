import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Followup } from "../lib/types";
import { Button, Field, Sheet, friendlyError, useToast } from "./ui";

/** Mark a follow-up done, record what happened, and prompt for the next one. */
export function CompleteFollowupSheet({ f, onClose, onScheduleNext }: { f: Followup | null; onClose: () => void; onScheduleNext: (f: Followup) => void }) {
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  async function done(next: boolean) {
    if (!f) return;
    setSaving(true);
    const { error } = await supabase.from("followups").update({ status: "done", completed_at: new Date().toISOString(), outcome: outcome || null }).eq("id", f.id);
    if (!error) await supabase.from("lead_activities").insert({ lead_id: f.lead_id, type: f.type === "visit" ? "visit" : f.type === "whatsapp" ? "whatsapp" : "call", body: `Follow-up done${outcome ? `: ${outcome}` : ""}` });
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    ["followups", "leads", "lead", "activities"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Follow-up done"); setOutcome("");
    const done = f; onClose();
    if (next) onScheduleNext(done);
  }
  return (
    <Sheet open={!!f} onClose={onClose} title="Mark follow-up done"
      footer={<><Button variant="secondary" className="flex-1" loading={saving} onClick={() => done(false)}>Done</Button><Button className="flex-1" loading={saving} onClick={() => done(true)}>Done & schedule next</Button></>}>
      <Field label="What happened?" hint="Shown on the lead's timeline">
        <textarea className="input" rows={3} autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Interested, wants survey on Saturday" />
      </Field>
    </Sheet>
  );
}

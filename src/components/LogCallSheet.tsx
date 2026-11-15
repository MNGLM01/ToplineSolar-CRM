import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "./ui";

const OUTCOMES = ["Talked, interested", "Talked, not interested", "Call back later", "Didn't pick up", "Switched off / not reachable", "Wrong number"];

export function LogCallSheet({ open, onClose, leadId, onScheduleNext }: { open: boolean; onClose: () => void; leadId: string; onScheduleNext: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  async function save(next: boolean) {
    setSaving(true);
    const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, type: "call", body: [outcome, note].filter(Boolean).join(": "), meta: { outcome } });
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    qc.invalidateQueries({ queryKey: ["activities"] }); qc.invalidateQueries({ queryKey: ["leads"] });
    toast("Call logged"); setOutcome(""); setNote(""); onClose();
    if (next) onScheduleNext();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Log a call"
      footer={<><Button variant="secondary" className="flex-1" disabled={!outcome} loading={saving} onClick={() => save(false)}>Save</Button><Button className="flex-1" disabled={!outcome} loading={saving} onClick={() => save(true)}>Save & schedule next</Button></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {OUTCOMES.map((o) => (
          <button key={o} onClick={() => setOutcome(o)} className={cx("min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium transition", outcome === o ? "border-orange bg-orange-tint text-ink" : "border-rule text-body")}>{o}</button>
        ))}
      </div>
      <Field label="Note (optional)" className="mt-4"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}

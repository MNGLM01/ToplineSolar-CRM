import { useState } from "react";
import { useLostReasons } from "../lib/queries";
import { Button, Field, Sheet } from "./ui";

export function LostReasonSheet({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reasonId: number, note: string) => void }) {
  const { data: reasons } = useLostReasons();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Why was this lead lost?"
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" disabled={!reason} onClick={() => { onConfirm(Number(reason), note); setReason(""); setNote(""); }}>Mark as lost</Button>
      </>}>
      <div className="grid gap-2">
        {reasons?.filter((r) => r.active).map((r) => (
          <label key={r.id} className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-rule px-3 has-[:checked]:border-orange has-[:checked]:bg-orange-tint">
            <input type="radio" name="reason" value={r.id} checked={reason === String(r.id)} onChange={(e) => setReason(e.target.value)} className="accent-orange" />
            <span className="text-[15px] text-ink">{r.name}</span>
          </label>
        ))}
        <Field label="Note (optional)" className="mt-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

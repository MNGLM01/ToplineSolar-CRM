import { supabase } from "./supabase";

/** Change a lead's stage. The database writes the timeline entry automatically. */
export async function moveStage(leadId: string, stageId: number, lost?: { reasonId: number; note: string }) {
  const patch: Record<string, unknown> = { stage_id: stageId };
  if (lost) patch.lost_reason_id = lost.reasonId;
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) throw error;
  if (lost?.note) await supabase.from("lead_activities").insert({ lead_id: leadId, type: "note", body: `Lost: ${lost.note}` });
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useChecklistTemplate, type ChecklistTick } from "../../lib/projects";
import { useProfiles } from "../../lib/queries";
import { fmtDate } from "../../lib/format";
import { cx, friendlyError, useToast } from "../ui";

export function useChecklist(projectId: string) {
  return useQuery({
    queryKey: ["checklist", projectId],
    queryFn: async () => (await supabase.from("project_checklist").select("*").eq("project_id", projectId)).data as ChecklistTick[],
  });
}

export function ChecklistPanel({ projectId, locked }: { projectId: string; locked: boolean }) {
  const { data: tpl } = useChecklistTemplate();
  const { data: ticks } = useChecklist(projectId);
  const { data: profiles } = useProfiles();
  const qc = useQueryClient(); const toast = useToast();
  const tickOf = (itemId: number) => ticks?.find((t) => t.item_id === itemId);
  const name = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name.split(" ")[0] ?? "";

  async function toggle(itemId: number, done: boolean) {
    qc.setQueryData<ChecklistTick[]>(["checklist", projectId], (old) => old?.map((t) => (t.item_id === itemId ? { ...t, done } : t)));
    const { error } = await supabase.from("project_checklist").update({ done }).eq("project_id", projectId).eq("item_id", itemId);
    if (error) toast(friendlyError(error), "error");
    qc.invalidateQueries({ queryKey: ["checklist", projectId] });
  }

  if (!tpl || !ticks) return null;
  return (
    <div className="space-y-4">
      {tpl.stages.filter((s) => s.active).map((s) => {
        const items = tpl.items.filter((i) => i.stage_id === s.id && tickOf(i.id));
        if (!items.length) return null;
        const req = items.filter((i) => i.required);
        const doneReq = req.filter((i) => tickOf(i.id)?.done).length;
        return (
          <div key={s.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h3 className="font-bold">{s.name}</h3>
              <span className={cx("chip", doneReq === req.length ? "bg-success-tint text-success" : "bg-cloud text-muted")}>{doneReq}/{req.length} required</span>
            </div>
            <ul className="divide-y divide-rule/60">
              {items.map((i) => {
                const t = tickOf(i.id)!;
                return (
                  <li key={i.id}>
                    <button disabled={locked} onClick={() => toggle(i.id, !t.done)} className={cx("flex w-full items-center gap-3 px-4 py-3 text-left transition", !locked && "hover:bg-cloud/60")}>
                      <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition", t.done ? "border-success bg-success text-white" : "border-rule bg-white")}>
                        {t.done && <Check className="h-4 w-4" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-[15px]", t.done ? "text-muted" : "text-ink")}>{i.text}{!i.required && <span className="ml-1.5 text-xs text-muted">(optional)</span>}</span>
                        {t.done && t.done_at && <span className="block text-xs text-muted">{name(t.done_by)} · {fmtDate(t.done_at)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

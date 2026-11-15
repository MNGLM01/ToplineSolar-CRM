import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fmtDateTime, fmtPhone } from "../lib/format";
import type { Lead } from "../lib/types";
import { Button, Empty, PageHeader, PageLoader, friendlyError, useToast } from "../components/ui";

export default function Trash() {
  const qc = useQueryClient(); const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["leads", "trash"],
    queryFn: async () => (await supabase.from("leads").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false })).data as Lead[],
  });
  async function restore(id: string) {
    const { error } = await supabase.from("leads").update({ deleted_at: null }).eq("id", id);
    if (error) toast(friendlyError(error), "error"); else { toast("Lead restored"); qc.invalidateQueries({ queryKey: ["leads"] }); }
  }
  return (
    <div>
      <PageHeader title="Trash" subtitle="Deleted leads stay here and can be restored. Nothing is ever wiped automatically." />
      <div className="card divide-y divide-rule/70">
        {isLoading ? <PageLoader /> : !data?.length ? <Empty icon={<Trash2 className="h-6 w-6" />} title="Trash is empty" /> : data.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{l.name} <span className="font-normal text-muted">· {l.lead_no}</span></p><p className="text-sm text-muted">{fmtPhone(l.phone)} · deleted {fmtDateTime(l.deleted_at)}</p></div>
            <Button size="sm" variant="secondary" onClick={() => restore(l.id)}><RotateCcw className="h-4 w-4" />Restore</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

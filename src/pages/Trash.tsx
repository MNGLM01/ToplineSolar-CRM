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
  const { data: projects } = useQuery({
    queryKey: ["projects", "trash"],
    queryFn: async () => (await supabase.from("projects").select("id, project_no, deleted_at, customer:customers(name, phone)").not("deleted_at", "is", null).order("deleted_at", { ascending: false })).data as unknown as { id: string; project_no: string; deleted_at: string; customer: { name: string; phone: string } }[],
  });
  async function restoreProject(id: string) {
    const { error } = await supabase.from("projects").update({ deleted_at: null }).eq("id", id);
    if (error) toast(friendlyError(error), "error"); else { toast("Project restored"); qc.invalidateQueries({ queryKey: ["projects"] }); }
  }
  return (
    <div>
      <PageHeader title="Trash" subtitle="Deleted leads and projects stay here and can be restored. Nothing is ever wiped automatically." />
      {!!projects?.length && (
        <>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Projects</h2>
          <div className="card mb-5 divide-y divide-rule/70">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{p.customer.name} <span className="font-normal text-muted">· {p.project_no}</span></p><p className="text-sm text-muted">{fmtPhone(p.customer.phone)} · deleted {fmtDateTime(p.deleted_at)}</p></div>
                <Button size="sm" variant="secondary" onClick={() => restoreProject(p.id)}><RotateCcw className="h-4 w-4" />Restore</Button>
              </div>
            ))}
          </div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Leads</h2>
        </>
      )}
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

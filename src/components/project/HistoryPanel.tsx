import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useProfiles } from "../../lib/queries";
import { fmtDateTime } from "../../lib/format";
import { MILESTONES } from "../../lib/projects";
import { Empty, PageLoader } from "../ui";

interface AuditRow { id: number; table_name: string; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; user_id: string | null; created_at: string }
const SKIP = new Set(["updated_at", "status_changed_at", "updated_by", "done_by", "done_at", "verified_by", "verified_at", "id", "project_id"]);
const TABLE = { projects: "Project", customers: "Customer", project_milestones: "Portal step", project_checklist: "Checklist", documents: "Document", subsidies: "Subsidy", bank_loans: "Bank loan" } as Record<string, string>;
const label = (k: string) => k.replace(/_id$/, "").replace(/_/g, " ");
const show = (v: unknown) => (v == null || v === "" ? "empty" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Full change history of a project (owner only): who changed what, from what, to what, and when. */
export function HistoryPanel({ projectId, customerId }: { projectId: string; customerId: string }) {
  const { data: profiles } = useProfiles();
  const { data, isLoading } = useQuery({
    queryKey: ["history", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*")
        .or(`and(table_name.eq.projects,record_id.eq.${projectId}),and(table_name.eq.customers,record_id.eq.${customerId}),new_data->>project_id.eq.${projectId},old_data->>project_id.eq.${projectId}`)
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as AuditRow[];
    },
  });
  if (isLoading) return <PageLoader />;
  const rows = (data ?? []).map((r) => {
    const changes = r.action === "UPDATE" && r.old_data && r.new_data
      ? Object.keys(r.new_data).filter((k) => !SKIP.has(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
      : [];
    return { r, changes };
  }).filter(({ r, changes }) => r.action !== "UPDATE" || changes.length > 0)
    .filter(({ r }) => !(r.action === "INSERT" && ["project_milestones", "project_checklist", "subsidies", "bank_loans"].includes(r.table_name)));
  if (!rows.length) return <div className="card"><Empty title="No changes yet" /></div>;
  const who = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? "System";
  const what = (r: AuditRow) => {
    const d = (r.new_data ?? r.old_data) as Record<string, unknown>;
    if (r.table_name === "project_milestones") return `Portal step ${d.step}: ${MILESTONES[Number(d.step) - 1]?.name}`;
    if (r.table_name === "documents") return `Document ${d.file_name ?? ""}`;
    if (r.table_name === "project_checklist") return `Checklist item #${d.item_id}`;
    return TABLE[r.table_name] ?? r.table_name;
  };
  return (
    <div className="card divide-y divide-rule/70">
      {rows.map(({ r, changes }) => (
        <div key={r.id} className="px-4 py-3">
          <p className="text-sm"><b className="text-ink">{who(r.user_id)}</b> <span className="text-muted">{r.action === "INSERT" ? "added" : r.action === "DELETE" ? "removed" : "changed"}</span> <span className="text-ink">{what(r)}</span></p>
          {changes.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {changes.map((k) => (
                <li key={k} className="text-muted"><span className="capitalize">{label(k)}</span>: <span className="text-danger/80 line-through">{show(r.old_data![k])}</span> → <span className="font-medium text-ink">{show(r.new_data![k])}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">{fmtDateTime(r.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useDocTypes, type Doc } from "../lib/projects";
import { signedUrl, signedUrls } from "../lib/files";
import { useProfiles } from "../lib/queries";
import { relTime } from "../lib/format";
import { Button, Empty, PageHeader, PageLoader, friendlyError, useToast } from "../components/ui";
import { RejectSheet } from "../components/project/DocumentsPanel";

type Row = Doc & { project: { id: string; project_no: string; locked: boolean; customer: { name: string } } | null; lead: { id: string; name: string } | null };

/** Every document waiting for the owner or office manager to check. */
export default function PendingDocuments() {
  const qc = useQueryClient(); const toast = useToast();
  const { data: types } = useDocTypes();
  const { data: profiles } = useProfiles();
  const [rejecting, setRejecting] = useState<Doc | null>(null);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["pending_docs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents")
        .select("*, project:projects(id, project_no, locked, customer:customers(name)), lead:leads(id, name)")
        .eq("status", "pending").is("deleted_at", null).order("created_at").limit(300);
      if (error) throw error;
      return data as Row[];
    },
  });
  const { data: thumbs } = useQuery({
    queryKey: ["thumbs", "pending", rows?.map((r) => r.id).join()], enabled: !!rows?.length,
    queryFn: () => signedUrls(rows!.filter((r) => r.mime_type?.startsWith("image/")).map((r) => r.file_path)),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["pending_docs"] }); qc.invalidateQueries({ queryKey: ["documents"] }); };
  async function verify(d: Doc) {
    const { error } = await supabase.from("documents").update({ status: "verified" }).eq("id", d.id);
    if (error) toast(friendlyError(error), "error"); else { toast("Verified"); refresh(); }
  }
  async function view(d: Doc) { try { window.open(await signedUrl(d.file_path), "_blank", "noopener"); } catch (e) { toast(friendlyError(e), "error"); } }

  return (
    <div>
      <PageHeader title="Documents to check" subtitle={rows ? `${rows.length} waiting, oldest first` : " "} />
      {isLoading ? <PageLoader /> : !rows?.length ? (
        <div className="card"><Empty icon={<FileCheck2 className="h-6 w-6" />} title="Nothing waiting" text="New uploads from the team will appear here for you to verify or reject." /></div>
      ) : (
        <div className="card divide-y divide-rule/70">
          {rows.map((d) => {
            const who = d.project ? d.project.customer.name : d.lead?.name ?? "";
            const to = d.project ? `/projects/${d.project.id}?tab=documents` : d.lead ? `/leads/${d.lead.id}/survey` : "#";
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button onClick={() => view(d)} className="shrink-0">
                  {thumbs?.[d.file_path] ? <img src={thumbs[d.file_path]} alt="" className="h-14 w-14 rounded-lg border border-rule object-cover" />
                    : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-tint text-blue"><FileText className="h-6 w-6" /></span>}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{types?.find((t) => t.id === d.doc_type_id)?.name}{d.version > 1 && <span className="font-normal text-muted"> · v{d.version}</span>}</p>
                  <Link to={to} className="block truncate text-sm text-blue">{who}{d.project ? ` · ${d.project.project_no}` : " · lead"}</Link>
                  <p className="text-xs text-muted">{profiles?.find((p) => p.id === d.uploaded_by)?.full_name ?? ""} · {relTime(d.created_at)}</p>
                </div>
                {d.project?.locked ? <span className="chip bg-cloud text-muted">Project locked</span> : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setRejecting(d)}>Reject</Button>
                    <Button size="sm" variant="navy" onClick={() => verify(d)}>Verify</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <RejectSheet d={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />
    </div>
  );
}

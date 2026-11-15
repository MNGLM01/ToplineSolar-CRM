import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ChevronDown, Download, FileText, Plus, XCircle, Clock, CircleDashed } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { can, useAuth } from "../../lib/auth";
import { useDocTypes, type Doc, type DocType } from "../../lib/projects";
import { downloadZip, fmtSize, signedUrl, signedUrls, uploadDocument } from "../../lib/files";
import { useProfiles } from "../../lib/queries";
import { fmtDate } from "../../lib/format";
import { Button, Field, Sheet, Spinner, cx, friendlyError, useToast } from "../ui";

type Scope = { projectId?: string; leadId?: string };

export function useDocuments(scope: Scope) {
  return useQuery({
    queryKey: ["documents", scope.projectId ?? scope.leadId],
    queryFn: async () => {
      let q = supabase.from("documents").select("*").is("deleted_at", null);
      q = scope.projectId ? q.eq("project_id", scope.projectId) : q.eq("lead_id", scope.leadId!);
      const { data, error } = await q.order("version", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });
}

const isImage = (d: Doc) => d.mime_type?.startsWith("image/");

export function DocumentsPanel({ scope, financeType, locked, zipName, only }: { scope: Scope; financeType?: string; locked?: boolean; zipName: string; only?: string[] }) {
  const { profile } = useAuth();
  const isAdmin = can(profile?.role).assignLeads; // owner or office manager
  const { data: types } = useDocTypes();
  const { data: docs } = useDocuments(scope);
  const qc = useQueryClient(); const toast = useToast();
  const [zipping, setZipping] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: thumbs } = useQuery({
    queryKey: ["thumbs", docs?.map((d) => d.id).join()], enabled: !!docs?.length, staleTime: 50 * 60_000,
    queryFn: () => signedUrls(docs!.filter(isImage).map((d) => d.file_path)),
  });

  const byType = useMemo(() => {
    const m = new Map<number, Doc[]>();
    docs?.forEach((d) => m.set(d.doc_type_id, [...(m.get(d.doc_type_id) ?? []), d]));
    m.forEach((v) => v.sort((a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at)));
    return m;
  }, [docs]);
  const visible = (t: DocType) => t.active && (!only || only.includes(t.name));
  // with `only`, show just those types as a simple list (e.g. survey photos), no % summary
  const required = only ? [] : (types ?? []).filter((t) => visible(t) && t.required && (!t.loan_only || financeType === "Bank loan"));
  const others = (types ?? []).filter((t) => visible(t) && !required.includes(t) && (only || byType.has(t.id)));
  const verified = required.filter((t) => byType.get(t.id)?.[0]?.status === "verified").length;
  const uploaded = required.filter((t) => byType.has(t.id)).length;
  const typeName = (id: number) => types?.find((t) => t.id === id)?.name ?? "Document";
  const refresh = () => { qc.invalidateQueries({ queryKey: ["documents"] }); qc.invalidateQueries({ queryKey: ["pending_docs"] }); };

  async function zip() {
    if (!docs?.length) return;
    try { await downloadZip(zipName, docs, typeName, (a, b) => setZipping(`${a}/${b}`)); }
    catch (e) { toast(friendlyError(e), "error"); }
    setZipping(null);
  }

  return (
    <div className="space-y-4">
      {required.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Required documents</p>
              <p className="text-2xl font-extrabold tabular-nums text-ink">{Math.round((verified / required.length) * 100)}% <span className="text-sm font-medium text-muted">verified</span></p>
              <p className="text-xs text-muted">{uploaded} of {required.length} uploaded · {verified} verified</p>
            </div>
            <Button variant="secondary" size="sm" onClick={zip} disabled={!docs?.length || !!zipping}>
              {zipping ? <><Spinner className="h-4 w-4" />{zipping}</> : <><Download className="h-4 w-4" />Download all (ZIP)</>}
            </Button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule/70"><div className="h-full rounded-full bg-success" style={{ width: `${(verified / required.length) * 100}%` }} /></div>
        </div>
      )}

      <div className="card divide-y divide-rule/70">
        {required.map((t) => <DocRow key={t.id} t={t} versions={byType.get(t.id) ?? []} thumbs={thumbs} scope={scope} locked={locked} isAdmin={isAdmin} onChange={refresh} />)}
        {others.map((t) => <DocRow key={t.id} t={t} versions={byType.get(t.id) ?? []} thumbs={thumbs} scope={scope} locked={locked} isAdmin={isAdmin} onChange={refresh} />)}
        {!locked && (
          <button onClick={() => setAdding(true)} className="flex w-full items-center gap-2 px-4 py-3.5 text-sm font-semibold text-blue hover:bg-cloud/60">
            <Plus className="h-4 w-4" />Add another document or photo
          </button>
        )}
      </div>
      {!required.length && docs && docs.length > 0 && (
        <Button variant="secondary" size="sm" onClick={zip} disabled={!!zipping}><Download className="h-4 w-4" />{zipping ?? "Download all (ZIP)"}</Button>
      )}
      <AddDocSheet open={adding} onClose={() => setAdding(false)} types={(types ?? []).filter(visible)} scope={scope} onDone={refresh} />
    </div>
  );
}

function StatusIcon({ d }: { d?: Doc }) {
  if (!d) return <CircleDashed className="h-5 w-5 text-rule" />;
  if (d.status === "verified") return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (d.status === "rejected") return <XCircle className="h-5 w-5 text-danger" />;
  return <Clock className="h-5 w-5 text-amber" />;
}
const statusText = (d?: Doc) => !d ? "Missing" : d.status === "verified" ? "Verified" : d.status === "rejected" ? "Rejected" : "Waiting for check";

function DocRow({ t, versions, thumbs, scope, locked, isAdmin, onChange }: {
  t: DocType; versions: Doc[]; thumbs?: Record<string, string>; scope: Scope; locked?: boolean; isAdmin: boolean; onChange: () => void;
}) {
  const latest = versions[0];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Doc | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { data: profiles } = useProfiles();
  const multi = /photo/i.test(t.name) || t.name === "Other";

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadDocument({ projectId: scope.projectId, leadId: scope.leadId, docTypeId: t.id, file: f });
      toast(files.length > 1 ? `${files.length} files uploaded` : "Uploaded");
      onChange();
    } catch (e) { toast(friendlyError(e), "error"); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  async function verify(d: Doc) {
    const { error } = await supabase.from("documents").update({ status: "verified", reject_reason: null }).eq("id", d.id);
    if (error) toast(friendlyError(error), "error"); else { toast("Marked as verified"); onChange(); }
  }
  async function view(d: Doc) {
    try { window.open(await signedUrl(d.file_path), "_blank", "noopener"); } catch (e) { toast(friendlyError(e), "error"); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => versions.length && setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <StatusIcon d={latest} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">{t.name}{t.loan_only && <span className="ml-1.5 text-xs text-muted">loan</span>}</span>
            <span className={cx("block truncate text-xs", latest?.status === "rejected" ? "text-danger" : "text-muted")}>
              {statusText(latest)}{latest ? ` · ${multi && versions.length > 1 ? `${versions.length} files` : `v${latest.version}`} · ${fmtDate(latest.created_at)}` : ""}
              {latest?.status === "rejected" && latest.reject_reason ? ` · ${latest.reject_reason}` : ""}
            </span>
          </span>
          {latest && isImage(latest) && thumbs?.[latest.file_path] && <img src={thumbs[latest.file_path]} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-rule object-cover" />}
          {versions.length > 0 && <ChevronDown className={cx("h-4 w-4 shrink-0 text-muted transition", open && "rotate-180")} />}
        </button>
        {!locked && (
          <>
            <input ref={input} type="file" accept="image/*,application/pdf" multiple={multi} className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button onClick={() => input.current?.click()} disabled={busy} aria-label={`Upload ${t.name}`}
              className={cx("flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition", latest ? "text-blue hover:bg-blue-tint" : "bg-orange-tint text-orange-dark hover:bg-orange/20")}>
              {busy ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}<span className="hidden sm:inline">{latest ? (multi ? "Add" : "Replace") : "Upload"}</span>
            </button>
          </>
        )}
      </div>
      {open && (
        <ul className="mx-4 mb-3 space-y-2 rounded-xl bg-cloud p-2">
          {versions.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-white p-2">
              <button onClick={() => view(d)} className="shrink-0">
                {isImage(d) && thumbs?.[d.file_path]
                  ? <img src={thumbs[d.file_path]} alt={d.file_name} className="h-14 w-14 rounded-lg object-cover" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-tint text-blue"><FileText className="h-6 w-6" /></span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">v{d.version} · {statusText(d)}</p>
                <p className="truncate text-xs text-muted">{profiles?.find((p) => p.id === d.uploaded_by)?.full_name ?? ""} · {fmtDate(d.created_at)} · {fmtSize(d.size_bytes)}</p>
                {d.status === "rejected" && d.reject_reason && <p className="text-xs text-danger">Reason: {d.reject_reason}</p>}
              </div>
              {isAdmin && !locked && d.status === "pending" && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setRejecting(d)}>Reject</Button>
                  <Button size="sm" variant="navy" onClick={() => verify(d)}>Verify</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <RejectSheet d={rejecting} onClose={() => setRejecting(null)} onDone={onChange} />
    </div>
  );
}

export function RejectSheet({ d, onClose, onDone }: { d: Doc | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function go() {
    if (!reason.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("documents").update({ status: "rejected", reject_reason: reason.trim() }).eq("id", d!.id);
    setBusy(false);
    if (error) return toast(friendlyError(error), "error");
    toast("Rejected. The salesperson will see the reason."); setReason(""); onDone(); onClose();
  }
  return (
    <Sheet open={!!d} onClose={onClose} title="Reject document"
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button variant="danger" className="flex-1" disabled={!reason.trim()} loading={busy} onClick={go}>Reject</Button></>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {["Photo is blurry", "Name doesn't match", "Old / expired", "Page missing", "Wrong document"].map((r) => (
          <button key={r} onClick={() => setReason(r)} className={cx("chip h-8 border", reason === r ? "border-danger bg-danger-tint text-danger" : "border-rule bg-white text-body")}>{r}</button>
        ))}
      </div>
      <Field label="Reason"><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Sheet>
  );
}

function AddDocSheet({ open, onClose, types, scope, onDone }: { open: boolean; onClose: () => void; types: DocType[]; scope: Scope; onDone: () => void }) {
  const [typeId, setTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  async function onFiles(files: FileList | null) {
    if (!files?.length || !typeId) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadDocument({ ...scope, docTypeId: Number(typeId), file: f });
      toast("Uploaded"); onDone(); onClose(); setTypeId("");
    } catch (e) { toast(friendlyError(e), "error"); }
    setBusy(false);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add document or photo"
      footer={<Button className="flex-1" disabled={!typeId} loading={busy} onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Take photo or choose file</Button>}>
      <Field label="What is it?">
        <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Choose…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <p className="mt-3 text-xs text-muted">Photos are compressed to about 200 KB before upload. PDFs up to 10 MB.</p>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
    </Sheet>
  );
}

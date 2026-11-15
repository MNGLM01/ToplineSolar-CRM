import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Camera, ChevronLeft, FileText, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { can, useAuth } from "../../lib/auth";
import { usePartners } from "../../lib/queries";
import { KINDS, PAY_MODES, kindInfo, today, useCommissions, useExpenseCategories, type TxnKind, type TxnRow } from "../../lib/money";
import { BUCKET, compressImage } from "../../lib/files";
import { rupees } from "../../lib/format";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "../ui";
import { ProjectPicker, type PickedProject } from "./ProjectPicker";

export interface MoneyPreset { kind?: TxnKind; project?: PickedProject | null; partnerId?: string; amount?: number }

/** "Add money" in plain words: what happened, how much, when, how, and for which project. */
export function AddMoneySheet({ open, onClose, preset, edit }: { open: boolean; onClose: () => void; preset?: MoneyPreset; edit?: TxnRow | null }) {
  const { profile } = useAuth();
  const isOwner = can(profile?.role).seeMoneyTotals;
  const qc = useQueryClient(); const toast = useToast();
  const { data: cats } = useExpenseCategories();
  const { data: partners } = usePartners(open);
  const { data: commissions } = useCommissions(open);
  const [kind, setKind] = useState<TxnKind | null>(null);
  const [f, setF] = useState({ amount: "", date: today(), mode: "Cash", paidTo: "", reference: "", note: "", partnerId: "", categoryId: "" });
  const [project, setProject] = useState<PickedProject | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setFile(null);
    if (edit) {
      setKind(edit.kind);
      setF({ amount: String(edit.amount), date: edit.txn_date, mode: edit.mode, paidTo: edit.paid_to ?? "", reference: edit.reference ?? "", note: edit.note ?? "", partnerId: edit.partner_id ?? "", categoryId: edit.category_id ? String(edit.category_id) : "" });
      setProject(edit.project_id && edit.project ? { id: edit.project_id, project_no: edit.project.project_no, customer_name: edit.project.customer?.name ?? "" } : null);
    } else {
      setKind(preset?.kind ?? null);
      setF({ amount: preset?.amount ? String(preset.amount) : "", date: today(), mode: "Cash", paidTo: "", reference: "", note: "", partnerId: preset?.partnerId ?? "", categoryId: "" });
      setProject(preset?.project ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit?.id]);

  const info = kind ? kindInfo(kind) : null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pendingForPartner = useMemo(() => (commissions ?? []).filter((c) => c.partner_id === f.partnerId && c.pending > 0), [commissions, f.partnerId]);

  async function save() {
    if (!info) return;
    const e: Record<string, string> = {};
    const amt = Number(f.amount);
    if (!(amt > 0)) e.amount = "Enter the amount";
    if (!f.date) e.date = "Pick the date";
    if (info.needsProject && !project) e.project = "Pick the customer's project";
    if (info.needsPartner && !f.partnerId) e.partner = "Pick the partner";
    if (info.needsCategory && !f.categoryId) e.category = "Pick a category";
    if ((kind === "labour" || kind === "vendor") && !f.paidTo.trim()) e.paidTo = "Who was paid?";
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const row = {
      kind, amount: amt, txn_date: f.date, mode: f.mode, project_id: project?.id ?? null,
      partner_id: info.needsPartner ? f.partnerId : null, category_id: info.needsCategory ? Number(f.categoryId) : null,
      paid_to: f.paidTo.trim() || null, reference: f.reference.trim() || null, note: f.note.trim() || null,
    };
    try {
      const res = edit
        ? await supabase.from("transactions").update(row).eq("id", edit.id).select("id").single()
        : await supabase.from("transactions").insert(row).select("id").single();
      if (res.error) throw res.error;
      const id = res.data.id as string;
      if (file) {
        const body = await compressImage(file);
        const type = body !== file ? "image/jpeg" : file.type;
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type)) throw new Error("The receipt must be a photo or a PDF.");
        const path = `money/${id}/receipt-${Date.now().toString(36)}.${type === "application/pdf" ? "pdf" : type.split("/")[1].replace("jpeg", "jpg")}`;
        const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type });
        if (up.error) throw new Error("Saved, but the receipt photo didn't upload. Open the entry to try again.");
        const u = await supabase.from("transactions").update({ receipt_path: path }).eq("id", id);
        if (u.error) throw u.error;
      }
      toast(edit ? "Entry updated" : `${rupees(amt)} recorded`);
      qc.invalidateQueries({ queryKey: ["money"] });
      onClose();
    } catch (err) {
      toast(friendlyError(err), "error");
      qc.invalidateQueries({ queryKey: ["money"] });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!edit || !confirm("Delete this entry? It moves to the trash and is kept in the history.")) return;
    setBusy(true);
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", edit.id);
    setBusy(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    toast("Entry deleted"); qc.invalidateQueries({ queryKey: ["money"] }); onClose();
  }

  const title = edit ? `Edit ${edit.txn_no}` : info ? info.label : "Add money";
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={info ? (
        <>
          {edit && isOwner && <Button variant="danger" onClick={remove} disabled={busy} aria-label="Delete entry"><Trash2 className="h-4 w-4" /></Button>}
          {!edit && !preset?.kind && <Button variant="secondary" onClick={() => setKind(null)}><ChevronLeft className="h-4 w-4" />Back</Button>}
          <Button className="flex-1" loading={busy} onClick={save}>{edit ? "Save changes" : "Save"}</Button>
        </>
      ) : undefined}>
      {!info ? (
        <div className="space-y-5">
          {(["in", "out"] as const).map((dir) => (
            <div key={dir}>
              <p className="label">{dir === "in" ? "Money in" : "Money out"}</p>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.filter((k) => k.dir === dir).map((k) => (
                  <button key={k.kind} onClick={() => setKind(k.kind)}
                    className={cx("flex min-h-[64px] items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-[15px] font-semibold text-ink transition active:scale-[.98]",
                      dir === "in" ? "border-success/25 bg-success-tint/60 hover:bg-success-tint" : "border-rule bg-white hover:bg-cloud")}>
                    <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", dir === "in" ? "bg-success text-white" : "bg-orange-tint text-orange-dark")}>
                      {dir === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Amount (₹)" error={errors.amount} hint={Number(f.amount) > 0 ? rupees(Number(f.amount)) : undefined}>
            <input className="input h-14 text-2xl font-bold tabular-nums" inputMode="decimal" autoFocus={!edit} value={f.amount} onChange={set("amount")} placeholder="0" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" error={errors.date}><input type="date" className="input" value={f.date} max={today()} onChange={set("date")} /></Field>
            {info.needsCategory && (
              <Field label="Category" error={errors.category}>
                <select className="input" value={f.categoryId} onChange={set("categoryId")}>
                  <option value="">Choose…</option>
                  {cats?.filter((c) => c.active || String(c.id) === f.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {info.needsPartner && (
              <Field label="Partner" error={errors.partner}>
                <select className="input" value={f.partnerId} onChange={set("partnerId")}>
                  <option value="">Choose…</option>
                  {partners?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div>
            <span className="label">Paid how?</span>
            <div className="grid grid-cols-4 gap-1.5">
              {PAY_MODES.map((m) => (
                <button key={m} type="button" onClick={() => setF((x) => ({ ...x, mode: m }))}
                  className={cx("h-10 rounded-xl border text-[13px] font-semibold", f.mode === m ? "border-navy bg-navy text-white" : "border-rule text-body")}>{m === "Bank transfer" ? "Bank" : m}</button>
              ))}
            </div>
          </div>
          {info.needsPartner && pendingForPartner.length > 0 && !edit && (
            <div className="rounded-xl bg-cloud p-3">
              <p className="mb-2 text-xs font-semibold text-muted">Commission due to this partner. Tap to fill.</p>
              <div className="flex flex-wrap gap-1.5">
                {pendingForPartner.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setProject({ id: c.project_id, project_no: c.project_no, customer_name: c.customer_name }); setF((x) => ({ ...x, amount: String(c.pending) })); }}
                    className={cx("chip h-8 border", project?.id === c.project_id ? "border-navy bg-navy text-white" : "border-rule bg-white text-ink")}>{c.customer_name} · {rupees(c.pending)}</button>
                ))}
              </div>
            </div>
          )}
          {(info.needsProject || info.projectHint) && (
            <div>
              <span className="label">{info.needsProject ? "Customer / project" : "For which project? (optional)"}</span>
              <ProjectPicker value={project} onChange={setProject} error={errors.project} />
            </div>
          )}
          {info.paidTo && <Field label={info.paidTo} error={errors.paidTo}><input className="input" value={f.paidTo} onChange={set("paidTo")} /></Field>}
          {f.mode !== "Cash" && <Field label={f.mode === "Cheque" ? "Cheque number" : "UTR / transaction ID (optional)"}><input className="input" value={f.reference} onChange={set("reference")} /></Field>}
          <Field label="Note (optional)"><input className="input" value={f.note} onChange={set("note")} /></Field>
          <div>
            <span className="label">Receipt photo (optional)</span>
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-rule px-3 text-sm font-medium text-body hover:bg-cloud">
              {file ? <FileText className="h-4 w-4 text-blue" /> : <Camera className="h-4 w-4 text-muted" />}
              <span className="min-w-0 flex-1 truncate">{file ? file.name : edit?.receipt_path ? "Replace the receipt photo" : "Take a photo or choose a file"}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      )}
    </Sheet>
  );
}

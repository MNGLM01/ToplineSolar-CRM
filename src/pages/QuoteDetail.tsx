import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CopyPlus, Download, FileText, MessageCircle, Plus, RotateCcw, Search, Send, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useEstimateSettings, useProfiles } from "../lib/queries";
import { useLead } from "../lib/leads";
import { subsidyFor } from "../lib/estimate";
import { SYSTEM_TYPES, useDocTypes } from "../lib/projects";
import { BUCKET } from "../lib/files";
import { CUSTOMER_TYPES } from "../lib/types";
import { fmtDate, rupees, waLink } from "../lib/format";
import {
  GST_RATES, PRICE_CATEGORIES, STATUS_STYLE, emi, lineAmount, pdfFileName, priceToItem, quoteLabel, quoteTotals, savings, standardKit,
  useCompany, usePriceItems, useQuote, type QuoteItem, type Quotation,
} from "../lib/quotes";
import { Button, Empty, Field, PageLoader, Segmented, Sheet, cx, friendlyError, useToast } from "../components/ui";
import { ConvertLeadSheet } from "../components/ConvertLeadSheet";

type Form = Pick<Quotation, "customer_name" | "customer_phone" | "customer_address" | "capacity_kw" | "system_type" | "customer_type" | "items" | "extra_discount" | "subsidy" | "monthly_bill" | "include_loan" | "loan_amount" | "loan_rate" | "loan_months" | "valid_until" | "payment_terms" | "notes">;
const pick = (q: Quotation): Form => ({
  customer_name: q.customer_name, customer_phone: q.customer_phone, customer_address: q.customer_address, capacity_kw: Number(q.capacity_kw),
  system_type: q.system_type, customer_type: q.customer_type, items: q.items.map((i) => ({ ...i, qty: Number(i.qty), rate: Number(i.rate), discount_pct: Number(i.discount_pct || 0), gst_rate: Number(i.gst_rate) })),
  extra_discount: Number(q.extra_discount), subsidy: Number(q.subsidy), monthly_bill: q.monthly_bill == null ? null : Number(q.monthly_bill),
  include_loan: q.include_loan, loan_amount: q.loan_amount == null ? null : Number(q.loan_amount), loan_rate: q.loan_rate == null ? null : Number(q.loan_rate),
  loan_months: q.loan_months, valid_until: q.valid_until, payment_terms: q.payment_terms, notes: q.notes,
});

export default function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const { profile } = useAuth();
  const { data: q, isLoading } = useQuote(id);
  const { data: priceItems } = usePriceItems();
  const { data: est } = useEstimateSettings();
  const { data: co } = useCompany();
  const { data: docTypes } = useDocTypes();
  const { data: profiles } = useProfiles();
  const { data: lead } = useLead(q?.lead_id);
  const { data: versions } = useQuery({
    queryKey: ["quotes", "versions", q?.quote_no], enabled: !!q,
    queryFn: async () => (await supabase.from("quotations").select("id, version, status").eq("quote_no", q!.quote_no).is("deleted_at", null).order("version")).data as { id: string; version: number; status: string }[],
  });
  const { data: project } = useQuery({
    queryKey: ["lead_project", q?.lead_id], enabled: !!q,
    queryFn: async () => (await supabase.from("projects").select("id, project_no").eq("lead_id", q!.lead_id).is("deleted_at", null).maybeSingle()).data as { id: string; project_no: string } | null,
  });

  const [f, setF] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "pdf" | "status">("");
  const [picker, setPicker] = useState(false);
  const [share, setShare] = useState<{ blob: Blob; name: string } | null>(null);
  const [convert, setConvert] = useState(false);
  useEffect(() => { if (q) { setF(pick(q)); setDirty(false); } }, [q]);

  const totals = useMemo(() => (f ? quoteTotals(f.items, f.extra_discount) : null), [f]);
  if (isLoading || (q && !f)) return <PageLoader />;
  if (!q || !f || !totals) return <Empty title="Quotation not found" text="It may have been deleted, or it isn't shared with you." action={<Button variant="secondary" onClick={() => nav(-1)}>Go back</Button>} />;

  const editable = q.status === "Draft";
  const net = Math.max(totals.total - (f.subsidy || 0), 0);
  const sv = est ? savings(f.capacity_kw || 0, net, est, f.monthly_bill) : null;
  const loanEmi = f.include_loan ? emi(f.loan_amount ?? 0, f.loan_rate ?? 0, f.loan_months ?? 0) : 0;
  const autoSubsidy = est && f.customer_type === "Residential" ? Math.min(subsidyFor(f.capacity_kw || 0, est), totals.total) : 0;

  const upd = (p: Partial<Form>) => { setF((x) => ({ ...x!, ...p })); setDirty(true); };
  const updItem = (i: number, p: Partial<QuoteItem>) => upd({ items: f.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const refresh = () => ["quote", "quotes", "lead", "leads"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  async function save(silent = false) {
    if (!f!.customer_name.trim()) { toast("Enter the customer's name", "error"); return false; }
    if (!(f!.capacity_kw > 0)) { toast("Enter the system size in kW", "error"); return false; }
    if (!f!.items.length) { toast("Add at least one item", "error"); return false; }
    if (f!.extra_discount > totals!.gross) { toast("The discount is more than the quotation amount", "error"); return false; }
    setBusy("save");
    const { error } = await supabase.from("quotations").update({ ...f, items: f!.items.filter((i) => i.name.trim()) }).eq("id", q!.id);
    setBusy("");
    if (error) { toast(friendlyError(error), "error"); return false; }
    setDirty(false); if (!silent) toast("Quotation saved"); refresh(); return true;
  }
  async function setStatus(status: Quotation["status"], msg: string) {
    setBusy("status");
    const { error } = await supabase.from("quotations").update({ status }).eq("id", q!.id);
    setBusy("");
    if (error) { toast(friendlyError(error), "error"); return; }
    if (status === "Sent" || status === "Accepted") await supabase.from("leads").update({ deal_value: q!.total }).eq("id", q!.lead_id);
    toast(msg); refresh();
  }
  async function makePdf() {
    if (editable && dirty && !(await save(true))) return;
    if (!co || !est) return;
    setBusy("pdf");
    try {
      const fresh = (await supabase.from("quotations").select("*").eq("id", q!.id).single()).data as Quotation;
      const name = pdfFileName(fresh);
      let blob: Blob;
      if (!editable && fresh.pdf_path) {
        // the exact file that was sent
        const dl = await supabase.storage.from(BUCKET).download(fresh.pdf_path);
        if (dl.error) throw dl.error; blob = dl.data;
      } else {
        const { makeProposalPdf } = await import("../lib/pdf");
        const requiredDocs = (docTypes ?? []).filter((t) => t.active && t.required && (!t.loan_only || fresh.include_loan) && !["survey", "installation", "portal"].includes(t.category)).map((t) => t.name);
        const creator = profiles?.find((u) => u.id === (fresh.created_by ?? profile?.id));
        blob = await makeProposalPdf({ q: fresh, co, est, requiredDocs, preparedBy: creator ? `${creator.full_name}${creator.phone ? ` · ${creator.phone}` : ""}` : null });
        const path = `quotes/${fresh.id}/${fresh.quote_no}-v${fresh.version}.pdf`;
        const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "application/pdf", upsert: true });
        if (up.error) throw up.error;
        if (fresh.pdf_path !== path) await supabase.from("quotations").update({ pdf_path: path }).eq("id", fresh.id);
      }
      setShare({ blob, name });
    } catch (e) { toast(friendlyError(e), "error"); }
    finally { setBusy(""); }
  }
  async function revise() {
    if (dirty && editable && !(await save(true))) return;
    const { data, error } = await supabase.rpc("revise_quotation", { q: q!.id });
    if (error) { toast(friendlyError(error), "error"); return; }
    toast("New version created. Make your changes."); refresh(); nav(`/quotes/${data}`);
  }
  function fillKit() {
    if (!priceItems || !(f!.capacity_kw > 0)) { toast("Enter the system size first", "error"); return; }
    if (f!.items.length && !confirm(`Replace the items with the standard kit for ${f!.capacity_kw} kW?`)) return;
    const items = standardKit(f!.capacity_kw, f!.system_type, priceItems);
    const t = quoteTotals(items, 0);
    upd({ items, extra_discount: 0, subsidy: f!.customer_type === "Residential" && est ? Math.min(subsidyFor(f!.capacity_kw, est), t.total) : f!.subsidy });
  }

  return (
    <div className="pb-24 lg:pb-0">
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>

      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold sm:text-2xl">Quotation {quoteLabel(q)}</h1>
              <span className={cx("chip", STATUS_STYLE[q.status])}>{q.status}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              <Link to={`/leads/${q.lead_id}`} className="font-medium text-blue">{q.customer_name}</Link>
              {" · "}made {fmtDate(q.created_at)}{q.sent_at ? ` · sent ${fmtDate(q.sent_at)}` : ""}{q.decided_at ? ` · ${q.status.toLowerCase()} ${fmtDate(q.decided_at)}` : ""}
            </p>
            {versions && versions.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {versions.map((v) => (
                  <Link key={v.id} to={`/quotes/${v.id}`} replace className={cx("chip h-7 border", v.id === q.id ? "border-navy bg-navy text-white" : "border-rule bg-white text-body")}>v{v.version} · {v.status}</Link>
                ))}
              </div>
            )}
          </div>
          <div className="hidden flex-wrap gap-2 lg:flex">
            <Actions />
          </div>
        </div>
        {!editable && (
          <p className="mt-3 rounded-xl bg-cloud px-3 py-2 text-sm text-body">
            {q.status === "Sent" ? "This quotation has been sent, so it can't be changed. To change prices or items, make a new version." : q.status === "Accepted" ? "The customer accepted this quotation." : "The customer did not accept this quotation."}
          </p>
        )}
        {q.status === "Accepted" && (
          <div className="mt-3">
            {project ? (
              <Link to={`/projects/${project.id}`} className="flex items-center gap-3 rounded-xl bg-success-tint p-3 text-sm font-semibold text-ink">Customer · project {project.project_no}<span className="ml-auto text-success">Open →</span></Link>
            ) : lead && <Button onClick={() => setConvert(true)}>Convert to customer and open project</Button>}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card title="System">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Size (kW)"><Num value={f.capacity_kw} onChange={(v) => upd({ capacity_kw: v ?? 0 })} disabled={!editable} /></Field>
              <Field label="Monthly bill (₹)"><Num value={f.monthly_bill} onChange={(v) => upd({ monthly_bill: v })} disabled={!editable} /></Field>
              <Field label="Customer type" className="col-span-2">
                <select className="input" value={f.customer_type} disabled={!editable} onChange={(e) => upd({ customer_type: e.target.value, subsidy: e.target.value === "Residential" ? f.subsidy : 0 })}>
                  {CUSTOMER_TYPES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className={cx(!editable && "pointer-events-none opacity-60")}><Segmented value={f.system_type} onChange={(v) => upd({ system_type: v })} options={SYSTEM_TYPES.map((s) => ({ value: s, label: s }))} /></div>
              {editable && <Button size="sm" variant="secondary" onClick={fillKit}><Sparkles className="h-4 w-4 text-orange" />Fill standard kit for {f.capacity_kw || "?"} kW</Button>}
            </div>
          </Card>

          <Card title={`Items (${f.items.length})`} action={editable ? <button onClick={() => setPicker(true)} className="flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="h-4 w-4" />Add item</button> : undefined}>
            {!f.items.length && <p className="py-4 text-center text-sm text-muted">No items yet. Use “Fill standard kit” or add items from your price list.</p>}
            <ul className="-mx-4 divide-y divide-rule/70">
              {f.items.map((it, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {editable ? <input className="input h-9 font-semibold" value={it.name} onChange={(e) => updItem(i, { name: e.target.value })} aria-label="Item name" />
                        : <p className="font-semibold text-ink">{it.name}</p>}
                      {!editable && it.description && <p className="text-xs text-muted">{it.description}</p>}
                    </div>
                    {editable && <button onClick={() => upd({ items: f.items.filter((_, j) => j !== i) })} aria-label="Remove item" className="mt-1.5 rounded-lg p-1 text-muted hover:bg-danger-tint hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  <div className="mt-2 grid grid-cols-4 items-end gap-2 sm:grid-cols-5">
                    <Mini label={`Qty${it.unit ? ` (${it.unit})` : ""}`}><Num small value={it.qty} onChange={(v) => updItem(i, { qty: v ?? 0 })} disabled={!editable} /></Mini>
                    <Mini label="Rate ₹"><Num small value={it.rate} onChange={(v) => updItem(i, { rate: v ?? 0 })} disabled={!editable} /></Mini>
                    <Mini label="Disc %"><Num small value={it.discount_pct || null} onChange={(v) => updItem(i, { discount_pct: Math.min(Math.max(v ?? 0, 0), 100) })} disabled={!editable} placeholder="0" /></Mini>
                    <Mini label="GST">
                      <select className="input h-9 px-2 text-sm" value={it.gst_rate} disabled={!editable} onChange={(e) => updItem(i, { gst_rate: Number(e.target.value) })}>
                        {[...new Set([...GST_RATES, it.gst_rate])].map((g) => <option key={g} value={g}>{g}%</option>)}
                      </select>
                    </Mini>
                    <p className="col-span-4 text-right text-sm font-bold tabular-nums text-ink sm:col-span-1 sm:pb-2">{rupees(lineAmount(it))}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

        </div>

        <div className="space-y-4 lg:col-span-2 lg:row-span-2">
          <div className="space-y-4 lg:sticky lg:top-6">
            <Card title="Price">
              <dl className="space-y-2 text-sm">
                <Line k="Items total" v={rupees(totals.gross)} />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Special discount (₹)</dt>
                  <dd className="w-32"><Num small value={f.extra_discount || null} onChange={(v) => upd({ extra_discount: Math.max(v ?? 0, 0) })} disabled={!editable} placeholder="0" right /></dd>
                </div>
                <Line k="Taxable amount" v={rupees(totals.subtotal)} />
                <Line k="GST" v={rupees(totals.gstAmount)} />
                <div className="flex items-center justify-between rounded-xl bg-navy px-3 py-2.5 text-white"><dt className="font-semibold">Total (incl. GST)</dt><dd className="text-lg font-extrabold tabular-nums">{rupees(totals.total)}</dd></div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <dt className="text-muted">PM Surya Ghar subsidy (₹)</dt>
                  <dd className="w-32"><Num small value={f.subsidy || null} onChange={(v) => upd({ subsidy: Math.max(v ?? 0, 0) })} disabled={!editable} placeholder="0" right /></dd>
                </div>
                {editable && autoSubsidy > 0 && Math.round(autoSubsidy) !== Math.round(f.subsidy) && (
                  <button onClick={() => upd({ subsidy: autoSubsidy })} className="text-xs font-semibold text-blue">Use {rupees(autoSubsidy)} for {f.capacity_kw} kW</button>
                )}
                {f.customer_type !== "Residential" && <p className="text-xs text-muted">PM Surya Ghar subsidy is for residential homes only.</p>}
                <div className="flex items-center justify-between rounded-xl bg-orange-tint px-3 py-2.5"><dt className="font-semibold text-ink">Customer's effective cost</dt><dd className="text-lg font-extrabold tabular-nums text-ink">{rupees(net)}</dd></div>
              </dl>
              {sv && f.capacity_kw > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat k="Saves / month" v={`~${rupees(sv.monthly)}`} />
                  <MiniStat k="Payback" v={`~${sv.payback.toFixed(1)} yrs`} />
                  <MiniStat k="25 years" v={`~${rupees(sv.life25)}`} />
                </div>
              )}
            </Card>

            <Card title="Bank loan EMI" action={
              <label className={cx("flex items-center gap-2 text-sm font-semibold", !editable && "pointer-events-none opacity-60")}>
                <input type="checkbox" className="h-4 w-4 accent-orange" checked={f.include_loan}
                  onChange={(e) => upd(e.target.checked ? { include_loan: true, loan_amount: f.loan_amount ?? Math.round(totals.total * 0.9), loan_rate: f.loan_rate ?? 7, loan_months: f.loan_months ?? 84 } : { include_loan: false })} />
                Show on quotation
              </label>}>
              {f.include_loan ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Mini label="Loan ₹"><Num small value={f.loan_amount} onChange={(v) => upd({ loan_amount: v })} disabled={!editable} /></Mini>
                    <Mini label="Rate % / yr"><Num small value={f.loan_rate} onChange={(v) => upd({ loan_rate: v })} disabled={!editable} /></Mini>
                    <Mini label="Months"><Num small value={f.loan_months} onChange={(v) => upd({ loan_months: v == null ? null : Math.round(v) })} disabled={!editable} /></Mini>
                  </div>
                  <p className="mt-3 flex items-center justify-between rounded-xl bg-cloud px-3 py-2.5 text-sm"><span className="text-muted">EMI (approx.)</span><b className="text-lg tabular-nums text-ink">{rupees(loanEmi)} / month</b></p>
                </>
              ) : <p className="text-sm text-muted">Tick to show a loan option with the monthly EMI on the proposal.</p>}
            </Card>
          </div>
        </div>
        <div className="lg:col-span-3">
            <Card title="Customer and terms">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name on quotation"><input className="input" value={f.customer_name} disabled={!editable} onChange={(e) => upd({ customer_name: e.target.value })} /></Field>
                <Field label="Mobile"><input className="input" value={f.customer_phone ?? ""} disabled={!editable} onChange={(e) => upd({ customer_phone: e.target.value })} /></Field>
                <Field label="Address" className="sm:col-span-2"><input className="input" value={f.customer_address ?? ""} disabled={!editable} onChange={(e) => upd({ customer_address: e.target.value })} /></Field>
                <Field label="Valid until"><input type="date" className="input" value={f.valid_until ?? ""} disabled={!editable} onChange={(e) => upd({ valid_until: e.target.value || null })} /></Field>
                <Field label="Payment terms (one per line)" className="sm:col-span-2"><textarea className="input min-h-[84px] py-2" value={f.payment_terms ?? ""} disabled={!editable} onChange={(e) => upd({ payment_terms: e.target.value })} /></Field>
                <Field label="Note for the customer (optional)" className="sm:col-span-2"><textarea className="input min-h-[60px] py-2" value={f.notes ?? ""} disabled={!editable} onChange={(e) => upd({ notes: e.target.value })} /></Field>
              </div>
            </Card>
        </div>
      </div>

      {/* phone action bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-rule bg-white px-4 py-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><p className="text-xs text-muted">Total</p><p className="font-extrabold tabular-nums text-ink">{rupees(totals.total)}</p></div>
          <Actions compact />
        </div>
      </div>

      <PriceItemPicker open={picker} onClose={() => setPicker(false)} kw={f.capacity_kw} onAdd={(it) => upd({ items: [...f.items, it] })} />
      {share && (
        <ShareSheet blob={share.blob} name={share.name} q={q} onClose={() => setShare(null)}
          onShared={async () => { if (q.status === "Draft") await setStatus("Sent", "Marked as sent"); }} />
      )}
      {lead && <ConvertLeadSheet open={convert} onClose={() => setConvert(false)} lead={lead} />}
    </div>
  );

  function Actions({ compact }: { compact?: boolean }) {
    if (editable) return (
      <>
        <Button variant="secondary" size={compact ? "md" : "md"} loading={busy === "save"} disabled={!dirty || !!busy} onClick={() => save()}>{dirty ? "Save" : <><Check className="h-4 w-4" />Saved</>}</Button>
        <Button loading={busy === "pdf"} disabled={!!busy && busy !== "pdf"} onClick={makePdf}><FileText className="h-4 w-4" />{compact ? "PDF" : "Make PDF"}</Button>
        {!compact && <Button variant="ghost" disabled={!!busy} onClick={() => setStatus("Sent", "Marked as sent")}><Send className="h-4 w-4" />Mark sent</Button>}
      </>
    );
    return (
      <>
        <Button variant="secondary" loading={busy === "pdf"} onClick={makePdf}><FileText className="h-4 w-4" />PDF</Button>
        {q!.status === "Sent" && <>
          <Button variant="secondary" disabled={!!busy} onClick={() => setStatus("Accepted", "Marked as accepted")} className="text-success"><Check className="h-4 w-4" />{compact ? "" : "Accepted"}</Button>
          {!compact && <Button variant="secondary" disabled={!!busy} onClick={() => setStatus("Rejected", "Marked as not accepted")}><XCircle className="h-4 w-4" />Not accepted</Button>}
        </>}
        <Button variant={compact ? "secondary" : "navy"} disabled={!!busy} onClick={revise} aria-label="Make a new version"><CopyPlus className="h-4 w-4" />{compact ? "" : "New version"}</Button>
      </>
    );
  }
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <div className="card p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-bold">{title}</h3>{action}</div>{children}</div>;
}
function Mini({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1 block truncate text-[11px] font-medium text-muted">{label}</span>{children}</label>;
}
function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><dt className="text-muted">{k}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>;
}
function MiniStat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-success-tint px-2 py-2"><p className="text-[11px] text-success">{k}</p><p className="text-sm font-bold tabular-nums text-ink">{v}</p></div>;
}

/** Number input that lets people type freely ("1." or "") and reports a number. */
function Num({ value, onChange, disabled, small, placeholder, right }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; small?: boolean; placeholder?: string; right?: boolean }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { if (Number(text) !== value && !(text === "" && value == null)) setText(value == null ? "" : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className={cx("input tabular-nums disabled:bg-cloud", small && "h-9 px-2 text-sm", right && "text-right")} inputMode="decimal" value={text} disabled={disabled} placeholder={placeholder}
      onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); setText(t); onChange(t === "" ? null : Number(t) || 0); }} />
  );
}

function PriceItemPicker({ open, onClose, kw, onAdd }: { open: boolean; onClose: () => void; kw: number; onAdd: (it: QuoteItem) => void }) {
  const { data } = usePriceItems();
  const [q, setQ] = useState("");
  const toast = useToast();
  const list = (data ?? []).filter((i) => i.active && (!q || `${i.name} ${i.category}`.toLowerCase().includes(q.toLowerCase())));
  const add = (it: QuoteItem) => { onAdd(it); toast(`Added ${it.name}`); };
  return (
    <Sheet open={open} onClose={onClose} title="Add an item" footer={<Button className="flex-1" variant="secondary" onClick={onClose}>Done</Button>}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Search the price list" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button onClick={() => add({ item_id: null, category: "Other", name: q.trim() || "Custom item", description: null, unit: "pcs", qty: 1, rate: 0, discount_pct: 0, gst_rate: 18 })}
        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-rule px-3 py-2.5 text-sm font-semibold text-blue hover:bg-cloud"><Plus className="h-4 w-4" />Custom item{q.trim() ? `: “${q.trim()}”` : ""}</button>
      {PRICE_CATEGORIES.map((cat) => {
        const items = list.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="mb-3">
            <p className="label">{cat}</p>
            <ul className="divide-y divide-rule/70 rounded-xl border border-rule">
              {items.map((i) => (
                <li key={i.id}>
                  <button onClick={() => add(priceToItem(i, i.per_kw ? kw || 1 : 1))} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cloud">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-ink">{i.name}</span><span className="text-xs text-muted">{rupees(i.rate)} per {i.unit} · GST {i.gst_rate}%</span></span>
                    <Plus className="h-4 w-4 shrink-0 text-blue" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Sheet>
  );
}

function ShareSheet({ blob, name, q, onClose, onShared }: { blob: Blob; name: string; q: Quotation; onClose: () => void; onShared: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const first = q.customer_name.split(" ")[0];
  const text = `Namaste ${first} ji, Topline Solar ki taraf se aapke ${q.capacity_kw} kW solar system ka proposal (${quoteLabel(q)}).`;
  async function whatsapp() {
    setBusy(true);
    try {
      const { shareFile } = await import("../lib/pdf");
      if (await shareFile(blob, name, text)) { await onShared(); onClose(); return; }
      // computer or older phone: send a link that works for 7 days
      const path = `quotes/${q.id}/${q.quote_no}-v${q.version}.pdf`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 7 * 86400);
      if (error) throw error;
      const phone = (q.customer_phone ?? "").replace(/\D/g, "").slice(-10);
      window.open(phone.length === 10 ? waLink(phone, `${text}\n${data.signedUrl}`) : `https://wa.me/?text=${encodeURIComponent(`${text}\n${data.signedUrl}`)}`, "_blank");
      await onShared(); onClose();
    } catch (e) { toast(friendlyError(e), "error"); }
    finally { setBusy(false); }
  }
  async function download() {
    const { downloadBlob } = await import("../lib/pdf");
    downloadBlob(blob, name);
  }
  return (
    <Sheet open onClose={onClose} title="Proposal ready">
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-cloud p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-tint text-danger"><FileText className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{name}</p><p className="text-xs text-muted">{Math.max(1, Math.round(blob.size / 1024))} KB · saved with the quotation</p></div>
        <button onClick={() => window.open(URL.createObjectURL(blob), "_blank")} className="text-sm font-semibold text-blue">View</button>
      </div>
      <div className="grid gap-2">
        <Button size="lg" loading={busy} onClick={whatsapp} className="bg-success hover:bg-success"><MessageCircle className="h-5 w-5" />Share on WhatsApp</Button>
        <Button size="lg" variant="secondary" onClick={download}><Download className="h-5 w-5" />Download PDF</Button>
      </div>
      {q.status === "Draft" && <p className="mt-3 text-xs text-muted">Sharing marks the quotation as sent. After that, changes need a new version (v{q.version + 1}).</p>}
      {q.status !== "Draft" && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><RotateCcw className="h-3.5 w-3.5" />This is the same file that was sent to the customer.</p>}
      <button onClick={onClose} className="sr-only"><X /></button>
    </Sheet>
  );
}

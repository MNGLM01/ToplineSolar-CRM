import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { rupees } from "../../lib/format";
import { useProjectStatuses } from "../../lib/projects";
import { useExpenseCategories } from "../../lib/money";
import { DEFAULT_COMPANY, GST_RATES, PRICE_CATEGORIES, useCompany, usePriceItems, type Company, type PriceItem } from "../../lib/quotes";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "../ui";

function SampleNote({ text }: { text: string }) {
  return <p className="mb-3 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-ink">{text}</p>;
}

// ---------------------------------------------------------------- Price list
export function PriceListEditor() {
  const { data } = usePriceItems();
  const [editing, setEditing] = useState<PriceItem | "new" | null>(null);
  return (
    <div className="card p-4">
      <SampleNote text="These are sample prices to try the quotation builder. Replace them with your real rates; quotations already made keep their own prices." />
      {PRICE_CATEGORIES.map((cat) => {
        const items = (data ?? []).filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="mb-4">
            <p className="label">{cat}</p>
            <ul className="divide-y divide-rule/70 rounded-xl border border-rule">
              {items.map((i) => (
                <li key={i.id}>
                  <button onClick={() => setEditing(i)} className={cx("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cloud", !i.active && "opacity-50")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{i.name}</span>
                      <span className="text-xs text-muted">GST {i.gst_rate}%{i.per_kw ? " · quantity follows kW" : ""}{i.watt ? ` · ${i.watt} W` : ""}{i.capacity_kw ? ` · ${i.capacity_kw} kW` : ""}{!i.active ? " · hidden" : ""}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-bold tabular-nums text-ink">{rupees(i.rate)}<span className="block text-xs font-normal text-muted">per {i.unit}</span></span>
                    <Pencil className="h-4 w-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add item</Button>
      <PriceItemSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PriceItemSheet({ item, onClose }: { item: PriceItem | "new" | null; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const blank = { category: "Panel", name: "", description: "", unit: "pcs", rate: "", gst_rate: "5", watt: "", capacity_kw: "", per_kw: false, active: true };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (item === "new") setF(blank);
    else if (item) setF({ category: item.category, name: item.name, description: item.description ?? "", unit: item.unit, rate: String(item.rate), gst_rate: String(item.gst_rate), watt: item.watt ? String(item.watt) : "", capacity_kw: item.capacity_kw ? String(item.capacity_kw) : "", per_kw: item.per_kw, active: item.active });
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    if (!f.name.trim() || !(Number(f.rate) >= 0) || f.rate === "") { toast("Enter a name and a rate", "error"); return; }
    setBusy(true);
    const row = {
      category: f.category, name: f.name.trim(), description: f.description.trim() || null, unit: f.unit.trim() || "pcs", rate: Number(f.rate), gst_rate: Number(f.gst_rate),
      watt: f.category === "Panel" && f.watt ? Number(f.watt) : null, capacity_kw: f.category === "Inverter" && f.capacity_kw ? Number(f.capacity_kw) : null, per_kw: f.per_kw, active: f.active,
    };
    const { error } = item === "new"
      ? await supabase.from("price_items").insert({ ...row, sort: PRICE_CATEGORIES.indexOf(f.category as typeof PRICE_CATEGORIES[number]) * 10 + 9 })
      : await supabase.from("price_items").update(row).eq("id", (item as PriceItem).id);
    setBusy(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    toast("Price list updated"); qc.invalidateQueries({ queryKey: ["price_items"] }); onClose();
  }
  return (
    <Sheet open={!!item} onClose={onClose} title={item === "new" ? "Add price list item" : "Edit item"}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><select className="input" value={f.category} onChange={set("category")}>{PRICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Unit" hint="pcs, kW, m, set, lot"><input className="input" value={f.unit} onChange={set("unit")} /></Field>
        <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Description on the quotation (optional)" className="col-span-2"><input className="input" value={f.description} onChange={set("description")} /></Field>
        <Field label="Rate (₹, before GST)" hint={f.rate ? rupees(Number(f.rate)) : undefined}><input className="input" inputMode="decimal" value={f.rate} onChange={set("rate")} /></Field>
        <Field label="GST"><select className="input" value={f.gst_rate} onChange={set("gst_rate")}>{GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
        {f.category === "Panel" && <Field label="Watt per panel" hint="Used to work out the number of panels"><input className="input" inputMode="numeric" value={f.watt} onChange={set("watt")} /></Field>}
        {f.category === "Inverter" && <Field label="Inverter size (kW)" hint="Used to pick the right inverter"><input className="input" inputMode="decimal" value={f.capacity_kw} onChange={set("capacity_kw")} /></Field>}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4 accent-orange" checked={f.per_kw} onChange={(e) => setF((x) => ({ ...x, per_kw: e.target.checked }))} />Quantity follows the system size (e.g. structure or installation per kW)</label>
      <label className="mt-2 flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4 accent-orange" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} />Show in the quotation builder</label>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Company, bank, quotation text, commission rule
export function CompanyEditor() {
  const { data } = useCompany();
  const { data: statuses } = useProjectStatuses();
  const { data: rule } = useQuery({
    queryKey: ["settings", "commission"],
    queryFn: async () => ((await supabase.from("app_settings").select("value").eq("key", "commission").maybeSingle()).data?.value as { earn_at_status: string } | undefined) ?? { earn_at_status: "Net Metering" },
  });
  const [f, setF] = useState<Company>(DEFAULT_COMPANY);
  const [earnAt, setEarnAt] = useState("Net Metering");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (data) setF(data); }, [data]);
  useEffect(() => { if (rule) setEarnAt(rule.earn_at_status); }, [rule]);
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: k === "quote_valid_days" ? Number(e.target.value) || 0 : e.target.value }));
  async function save() {
    setBusy(true);
    const a = await supabase.from("app_settings").upsert({ key: "company", value: { ...f, is_sample: false } });
    const b = await supabase.from("app_settings").upsert({ key: "commission", value: { earn_at_status: earnAt } });
    setBusy(false);
    const err = a.error ?? b.error;
    if (err) toast(friendlyError(err), "error"); else { qc.invalidateQueries({ queryKey: ["settings"] }); toast("Company details saved"); }
  }
  return (
    <div className="space-y-4">
      {data?.is_sample && <SampleNote text="Bank, GST and email below are sample details so you can see how the proposal looks. Put in your real ones and save." />}
      <div className="card p-4">
        <h3 className="mb-3 font-bold">On every quotation and statement</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name"><input className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Tagline"><input className="input" value={f.tagline} onChange={set("tagline")} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
          <Field label="Phone numbers"><input className="input" value={f.phones} onChange={set("phones")} /></Field>
          <Field label="Email"><input className="input" value={f.email} onChange={set("email")} /></Field>
          <Field label="GSTIN"><input className="input uppercase" value={f.gstin} onChange={set("gstin")} /></Field>
          <Field label="Website"><input className="input" value={f.website} onChange={set("website")} /></Field>
        </div>
      </div>
      <div className="card p-4">
        <h3 className="mb-3 font-bold">Bank details for customer payments</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account name"><input className="input" value={f.bank_account_name} onChange={set("bank_account_name")} /></Field>
          <Field label="Bank and branch"><input className="input" value={f.bank_name} onChange={set("bank_name")} /></Field>
          <Field label="Account number"><input className="input" value={f.bank_account_no} onChange={set("bank_account_no")} /></Field>
          <Field label="IFSC"><input className="input uppercase" value={f.bank_ifsc} onChange={set("bank_ifsc")} /></Field>
          <Field label="UPI ID"><input className="input" value={f.upi_id} onChange={set("upi_id")} /></Field>
        </div>
      </div>
      <div className="card p-4">
        <h3 className="mb-3 font-bold">Quotation text</h3>
        <div className="grid gap-3">
          <Field label="Quotation valid for (days)" className="max-w-[200px]"><input className="input" inputMode="numeric" value={f.quote_valid_days} onChange={set("quote_valid_days")} /></Field>
          <Field label="Default payment terms (one per line)"><textarea className="input min-h-[90px] py-2" value={f.payment_terms} onChange={set("payment_terms")} /></Field>
          <Field label="Terms and conditions (one per line)"><textarea className="input min-h-[140px] py-2" value={f.quote_terms} onChange={set("quote_terms")} /></Field>
        </div>
      </div>
      <div className="card p-4">
        <h3 className="mb-1 font-bold">Referral commission</h3>
        <p className="mb-3 text-sm text-muted">A partner's commission becomes due automatically when their customer's project reaches this status.</p>
        <select className="input max-w-xs" value={earnAt} onChange={(e) => setEarnAt(e.target.value)}>
          {statuses?.filter((s) => !s.is_cancelled && s.name !== "On Hold").map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
      </div>
      <Button loading={busy} onClick={save}>Save company details</Button>
    </div>
  );
}

// ---------------------------------------------------------------- Expense categories
export function ExpenseCategoriesEditor() {
  const { data } = useExpenseCategories();
  const qc = useQueryClient(); const toast = useToast();
  const [name, setName] = useState("");
  async function run(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) toast(friendlyError(error), "error"); else qc.invalidateQueries({ queryKey: ["expense_categories"] }); }
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm text-muted">Categories for office expenses, such as rent or fuel. Hidden ones keep their past entries.</p>
      <ul className="divide-y divide-rule/70">
        {data?.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-2 py-2", !r.active && "opacity-50")}>
            <input className="input h-10" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && run(supabase.from("expense_categories").update({ name: e.target.value.trim() }).eq("id", r.id))} />
            <Button size="sm" variant="ghost" onClick={() => run(supabase.from("expense_categories").update({ active: !r.active }).eq("id", r.id))}>{r.active ? "Hide" : "Show"}</Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => { if (name.trim()) { run(supabase.from("expense_categories").insert({ name: name.trim(), sort: (data?.length ?? 0) + 1 })); setName(""); } }}><Plus className="h-4 w-4" />Add</Button>
      </div>
    </div>
  );
}

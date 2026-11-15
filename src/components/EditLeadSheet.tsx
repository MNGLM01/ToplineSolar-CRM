import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { normaliseMobile } from "../lib/format";
import { usePartners, useSources } from "../lib/queries";
import { CUSTOMER_TYPES, DISCOMS, DISTRICTS, ROOF_TYPES, type Lead } from "../lib/types";
import { Button, Field, Sheet, friendlyError, useToast } from "./ui";

export function EditLeadSheet({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Lead }) {
  const toForm = (l: Lead) => ({
    name: l.name, phone: l.phone, whatsapp: l.whatsapp ?? "", alt_phone: l.alt_phone ?? "", email: l.email ?? "",
    address: l.address ?? "", village: l.village ?? "", district: l.district ?? "", pincode: l.pincode ?? "",
    monthly_bill: l.monthly_bill?.toString() ?? "", roof_type: l.roof_type ?? "", customer_type: l.customer_type,
    sanctioned_load_kw: l.sanctioned_load_kw?.toString() ?? "", discom: l.discom ?? "",
    source_id: l.source_id?.toString() ?? "", partner_id: l.partner_id ?? "", notes: l.notes ?? "",
  });
  const [f, setF] = useState(toForm(lead));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: sources } = useSources();
  const { data: partners } = usePartners();
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (open) { setF(toForm(lead)); setErrors({}); } }, [open, lead]);
  const set = (k: keyof ReturnType<typeof toForm>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const isReferral = sources?.find((s) => s.name === "Referral Partner")?.id.toString() === f.source_id;

  async function save() {
    const e: Record<string, string> = {};
    const phone = normaliseMobile(f.phone);
    if (!f.name.trim()) e.name = "Required";
    if (!phone) e.phone = "Enter a valid 10-digit mobile number";
    if (f.whatsapp && !normaliseMobile(f.whatsapp)) e.whatsapp = "Invalid number";
    if (f.alt_phone && !normaliseMobile(f.alt_phone)) e.alt_phone = "Invalid number";
    if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = "6-digit pincode";
    setErrors(e); if (Object.keys(e).length) return;
    setSaving(true);
    const num = (v: string) => (v === "" ? null : Number(v));
    const { error } = await supabase.from("leads").update({
      name: f.name.trim(), phone, whatsapp: normaliseMobile(f.whatsapp), alt_phone: normaliseMobile(f.alt_phone), email: f.email || null,
      address: f.address || null, village: f.village || null, district: f.district || null, pincode: f.pincode || null,
      monthly_bill: num(f.monthly_bill), roof_type: f.roof_type || null, customer_type: f.customer_type,
      sanctioned_load_kw: num(f.sanctioned_load_kw), discom: f.discom || null,
      source_id: num(f.source_id), partner_id: isReferral ? f.partner_id || null : null, notes: f.notes || null,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    ["lead", "leads"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Changes saved"); onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit lead" wide
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} loading={saving}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" error={errors.name} className="sm:col-span-2"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Mobile *" error={errors.phone}><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="WhatsApp" error={errors.whatsapp}><input className="input" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></Field>
        <Field label="Alternate mobile" error={errors.alt_phone}><input className="input" value={f.alt_phone} onChange={set("alt_phone")} inputMode="tel" /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="Village / town"><input className="input" value={f.village} onChange={set("village")} /></Field>
        <Field label="District"><select className="input" value={f.district} onChange={set("district")}><option value="">Select</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Pincode" error={errors.pincode}><input className="input" value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} /></Field>
        <Field label="Monthly bill (₹)"><input className="input" value={f.monthly_bill} onChange={set("monthly_bill")} inputMode="numeric" /></Field>
        <Field label="Roof type"><select className="input" value={f.roof_type} onChange={set("roof_type")}><option value="">Select</option>{ROOF_TYPES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Customer type"><select className="input" value={f.customer_type} onChange={set("customer_type")}>{CUSTOMER_TYPES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Sanctioned load (kW)"><input className="input" value={f.sanctioned_load_kw} onChange={set("sanctioned_load_kw")} inputMode="decimal" /></Field>
        <Field label="DISCOM"><select className="input" value={f.discom} onChange={set("discom")}><option value="">Select</option>{DISCOMS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Source"><select className="input" value={f.source_id} onChange={set("source_id")}><option value="">Select</option>{sources?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        {isReferral && <Field label="Referral partner"><select className="input" value={f.partner_id} onChange={set("partner_id")}><option value="">Select</option>{partners?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Sheet>
  );
}

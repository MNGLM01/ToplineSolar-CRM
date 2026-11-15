import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { useDraft } from "../lib/draft";
import { normaliseMobile } from "../lib/format";
import { assignable, usePartners, useProfiles, useSources } from "../lib/queries";
import { CUSTOMER_TYPES, DISCOMS, DISTRICTS, ROOF_TYPES } from "../lib/types";
import { Button, Field, Sheet, cx, friendlyError, useToast } from "./ui";

const EMPTY = {
  name: "", phone: "", village: "", district: "", monthly_bill: "", roof_type: "", customer_type: "Residential",
  source_id: "", partner_id: "", assigned_to: "", temperature: "", notes: "",
  whatsapp: "", alt_phone: "", pincode: "", address: "", sanctioned_load_kw: "", discom: "", email: "",
};

export function NewLeadSheet({ open, onClose, partnerMode = false }: { open: boolean; onClose: () => void; partnerMode?: boolean }) {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const [f, setF, clearDraft, hasDraft] = useDraft(partnerMode ? "partner-new-lead" : "new-lead", EMPTY);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupe, setDupe] = useState<{ id: string; lead_no: string; name: string; assigned_name: string | null; visible: boolean } | null>(null);
  const { data: sources } = useSources();
  const { data: partners } = usePartners(!partnerMode);
  const { data: profiles } = useProfiles();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const mobile = normaliseMobile(f.phone);
  useEffect(() => {
    setDupe(null);
    if (!mobile || !open) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("find_lead_by_phone", { p: mobile });
      if (data && data.length) setDupe(data[0]);
    }, 350);
    return () => clearTimeout(t);
  }, [mobile, open]);

  const referralSource = sources?.find((s) => s.name === "Referral Partner");
  const isReferral = referralSource && String(referralSource.id) === f.source_id;

  async function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter the customer's name";
    if (!mobile) e.phone = "Enter a valid 10-digit mobile number";
    if (f.whatsapp && !normaliseMobile(f.whatsapp)) e.whatsapp = "Enter a valid 10-digit number";
    if (f.alt_phone && !normaliseMobile(f.alt_phone)) e.alt_phone = "Enter a valid 10-digit number";
    if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = "6-digit pincode";
    if (dupe) e.phone = "This mobile number is already a lead";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const num = (v: string) => (v === "" ? null : Number(v));
    const row = {
      name: f.name.trim(), phone: mobile, village: f.village || null, district: f.district || null,
      monthly_bill: num(f.monthly_bill), roof_type: f.roof_type || null, customer_type: f.customer_type,
      notes: f.notes || null,
      ...(partnerMode ? {} : {
        source_id: num(f.source_id), partner_id: isReferral ? f.partner_id || null : null,
        assigned_to: p.assignLeads ? f.assigned_to || null : undefined,
        temperature: f.temperature || null,
        whatsapp: normaliseMobile(f.whatsapp), alt_phone: normaliseMobile(f.alt_phone),
        pincode: f.pincode || null, address: f.address || null, sanctioned_load_kw: num(f.sanctioned_load_kw),
        discom: f.discom || null, email: f.email || null,
      }),
    };
    const { data, error } = await supabase.from("leads").insert(row).select("id").single();
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    clearDraft(); setF(EMPTY); setMore(false);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["partner_leads"] });
    toast("Lead saved");
    onClose();
    if (!partnerMode && data) nav(`/leads/${data.id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title={partnerMode ? "Refer a customer" : "New lead"}
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={save} loading={saving}>Save lead</Button>
      </>}>
      {hasDraft && f.name && <p className="mb-3 rounded-lg bg-blue-tint px-3 py-2 text-xs text-blue">Your unsaved entry was restored.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name *" error={errors.name} className="sm:col-span-2">
          <input className="input" value={f.name} onChange={set("name")} autoFocus placeholder="Full name" />
        </Field>
        <Field label="Mobile number *" error={errors.phone}>
          <input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="98765 43210" />
        </Field>
        <Field label="Monthly electricity bill (₹)">
          <input className="input" value={f.monthly_bill} onChange={set("monthly_bill")} inputMode="numeric" placeholder="e.g. 2500" />
        </Field>
        {dupe && (
          <div className="flex items-start gap-2 rounded-xl bg-orange-tint px-3 py-2.5 text-sm text-ink sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
            <span>
              Already a lead: <b>{dupe.name}</b> ({dupe.lead_no}){dupe.assigned_name ? `, with ${dupe.assigned_name}` : ""}.{" "}
              {dupe.visible && !partnerMode && <button className="font-semibold text-blue underline" onClick={() => { onClose(); nav(`/leads/${dupe.id}`); }}>Open it</button>}
            </span>
          </div>
        )}
        <Field label="Village / town">
          <input className="input" value={f.village} onChange={set("village")} placeholder="e.g. Thakurganj" />
        </Field>
        <Field label="District">
          <select className="input" value={f.district} onChange={set("district")}>
            <option value="">Select</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Roof type">
          <select className="input" value={f.roof_type} onChange={set("roof_type")}>
            <option value="">Select</option>{ROOF_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Customer type">
          <select className="input" value={f.customer_type} onChange={set("customer_type")}>
            {CUSTOMER_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>

        {!partnerMode && <>
          <Field label="Source">
            <select className="input" value={f.source_id} onChange={set("source_id")}>
              <option value="">Select</option>{sources?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {isReferral ? (
            <Field label="Referral partner">
              <select className="input" value={f.partner_id} onChange={set("partner_id")}>
                <option value="">Select</option>{partners?.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Interest">
              <div className="flex gap-2">
                {(["hot", "warm", "cold"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setF((x) => ({ ...x, temperature: x.temperature === t ? "" : t }))}
                    className={cx("h-11 flex-1 rounded-xl border text-sm font-semibold capitalize transition",
                      f.temperature === t ? (t === "hot" ? "border-danger bg-danger-tint text-danger" : t === "warm" ? "border-orange bg-orange-tint text-orange-dark" : "border-blue bg-blue-tint text-blue") : "border-rule text-muted")}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {p.assignLeads && (
            <Field label="Assign to" className="sm:col-span-2">
              <select className="input" value={f.assigned_to} onChange={set("assigned_to")}>
                <option value="">Not assigned yet</option>
                {assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          )}
        </>}

        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input" rows={2} value={f.notes} onChange={set("notes")} placeholder="Anything useful for the first call" />
        </Field>

        {!partnerMode && (
          <div className="sm:col-span-2">
            <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-sm font-semibold text-blue">
              <ChevronDown className={cx("h-4 w-4 transition", more && "rotate-180")} /> {more ? "Fewer details" : "More details"}
            </button>
          </div>
        )}
        {more && !partnerMode && <>
          <Field label="WhatsApp (if different)" error={errors.whatsapp}><input className="input" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></Field>
          <Field label="Alternate mobile" error={errors.alt_phone}><input className="input" value={f.alt_phone} onChange={set("alt_phone")} inputMode="tel" /></Field>
          <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
          <Field label="Pincode" error={errors.pincode}><input className="input" value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Sanctioned load (kW)"><input className="input" value={f.sanctioned_load_kw} onChange={set("sanctioned_load_kw")} inputMode="decimal" /></Field>
          <Field label="DISCOM">
            <select className="input" value={f.discom} onChange={set("discom")}><option value="">Select</option>{DISCOMS.map((d) => <option key={d}>{d}</option>)}</select>
          </Field>
        </>}
      </div>
    </Sheet>
  );
}

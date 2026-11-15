import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { can, useAuth } from "../../lib/auth";
import { assignable, useProfiles } from "../../lib/queries";
import { SYSTEM_TYPES, type Customer, type Project } from "../../lib/projects";
import { normaliseMobile, rupees } from "../../lib/format";
import { DISCOMS, DISTRICTS } from "../../lib/types";
import { Button, Field, Sheet, friendlyError, useToast } from "../ui";

type Form = Record<string, string>;
const toForm = (o: object, keys: string[]): Form => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k] == null ? "" : String((o as Record<string, unknown>)[k])]));
const fromForm = (f: Form, numeric: string[]) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === "" ? null : numeric.includes(k) ? Number(v) : v.trim()]));

const P_KEYS = ["capacity_kw", "system_type", "total_cost", "finance_type", "assigned_to", "installer_names", "start_date", "installed_on",
  "panel_brand", "panel_wattage", "panel_count", "inverter_brand", "inverter_capacity_kw", "inverter_serial", "panel_serials", "structure_type", "battery_details", "notes"];
const P_NUM = ["capacity_kw", "total_cost", "panel_wattage", "panel_count", "inverter_capacity_kw"];

export function EditProjectSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { profile } = useAuth();
  const { data: profiles } = useProfiles();
  const [f, setF] = useState<Form>(toForm(project, P_KEYS));
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (open) setF(toForm(project, P_KEYS)); }, [open, project]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const dcKw = f.panel_wattage && f.panel_count ? (Number(f.panel_wattage) * Number(f.panel_count)) / 1000 : null;

  async function save() {
    const patch = fromForm(f, P_NUM);
    if (!can(profile?.role).assignLeads) delete patch.assigned_to;
    for (const k of P_NUM) if (patch[k] != null && Number.isNaN(patch[k])) return toast(`Check the number in “${k.replace(/_/g, " ")}”`, "error");
    setBusy(true);
    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
    setBusy(false);
    if (error) return toast(friendlyError(error), "error");
    ["project", "projects", "history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Project saved"); onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Project details" wide
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></>}>
      <Section title="System">
        <Field label="System size (kW)"><input className="input" inputMode="decimal" value={f.capacity_kw} onChange={set("capacity_kw")} /></Field>
        <Field label="Type"><select className="input" value={f.system_type} onChange={set("system_type")}>{SYSTEM_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Total project cost (₹)" hint={f.total_cost ? rupees(Number(f.total_cost)) : undefined}><input className="input" inputMode="numeric" value={f.total_cost} onChange={set("total_cost")} /></Field>
        <Field label="Payment"><select className="input" value={f.finance_type} onChange={set("finance_type")}><option>Cash</option><option>Bank loan</option></select></Field>
      </Section>
      <Section title="Team and dates">
        {can(profile?.role).assignLeads && (
          <Field label="Salesperson"><select className="input" value={f.assigned_to} onChange={set("assigned_to")}><option value="">Not assigned</option>{assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
        )}
        <Field label="Installer team (names)" hint="Installers don't log in; names are kept for the record."><input className="input" value={f.installer_names} onChange={set("installer_names")} /></Field>
        <Field label="Start date"><input type="date" className="input" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Installation date"><input type="date" className="input" value={f.installed_on} onChange={set("installed_on")} /></Field>
      </Section>
      <Section title="Panels and inverter" note="Needed before the project can be marked Completed.">
        <Field label="Panel brand"><input className="input" list="panel-brands" value={f.panel_brand} onChange={set("panel_brand")} /></Field>
        <datalist id="panel-brands">{["Waaree", "Adani", "Vikram", "Tata Power Solar", "Rayzon", "Goldi", "Premier", "Saatvik", "RenewSys"].map((b) => <option key={b} value={b} />)}</datalist>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Watt per panel"><input className="input" inputMode="numeric" value={f.panel_wattage} onChange={set("panel_wattage")} placeholder="540" /></Field>
          <Field label="Number of panels" hint={dcKw ? `= ${dcKw} kW DC` : undefined}><input className="input" inputMode="numeric" value={f.panel_count} onChange={set("panel_count")} /></Field>
        </div>
        <Field label="Inverter brand"><input className="input" list="inv-brands" value={f.inverter_brand} onChange={set("inverter_brand")} /></Field>
        <datalist id="inv-brands">{["Deye", "Growatt", "Solis", "Sungrow", "Havells", "Luminous", "UTL", "Polycab", "Fronius"].map((b) => <option key={b} value={b} />)}</datalist>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inverter size (kW)"><input className="input" inputMode="decimal" value={f.inverter_capacity_kw} onChange={set("inverter_capacity_kw")} /></Field>
          <Field label="Inverter serial no."><input className="input" value={f.inverter_serial} onChange={set("inverter_serial")} /></Field>
        </div>
        <Field label="Panel serial numbers" className="sm:col-span-2"><textarea className="input" rows={2} value={f.panel_serials} onChange={set("panel_serials")} placeholder="One per line or comma separated" /></Field>
        <Field label="Structure"><input className="input" value={f.structure_type} onChange={set("structure_type")} placeholder="GI elevated, aluminium…" /></Field>
        <Field label="Battery (hybrid / off-grid)"><input className="input" value={f.battery_details} onChange={set("battery_details")} /></Field>
      </Section>
      <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
    </Sheet>
  );
}

const C_KEYS = ["name", "father_name", "phone", "whatsapp", "alt_phone", "email", "address", "village", "district", "pincode", "consumer_no", "discom",
  "sanctioned_load_kw", "connection_phase", "co_applicant_name", "co_applicant_relation", "notes"];

export function EditCustomerSheet({ open, onClose, customer }: { open: boolean; onClose: () => void; customer: Customer }) {
  const [f, setF] = useState<Form>(toForm(customer, C_KEYS));
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (open) setF(toForm(customer, C_KEYS)); }, [open, customer]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    const phone = normaliseMobile(f.phone);
    if (!f.name.trim()) return toast("Name is required", "error");
    if (!phone) return toast("Enter a valid 10-digit mobile number", "error");
    if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) return toast("Enter a valid 6-digit pincode", "error");
    setBusy(true);
    const patch = { ...fromForm(f, ["sanctioned_load_kw"]), phone, whatsapp: normaliseMobile(f.whatsapp), alt_phone: normaliseMobile(f.alt_phone) };
    const { error } = await supabase.from("customers").update(patch).eq("id", customer.id);
    setBusy(false);
    if (error) return toast(friendlyError(error), "error");
    ["project", "projects", "history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Customer saved"); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Customer details" wide
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></>}>
      <Section title="Customer">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Father's / husband's name"><input className="input" value={f.father_name} onChange={set("father_name")} /></Field>
        <Field label="Mobile"><input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="WhatsApp"><input className="input" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} /></Field>
        <Field label="Alternate number"><input className="input" inputMode="tel" value={f.alt_phone} onChange={set("alt_phone")} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
      </Section>
      <Section title="Address">
        <Field label="House / street" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="Village / town"><input className="input" value={f.village} onChange={set("village")} /></Field>
        <Field label="District"><select className="input" value={f.district} onChange={set("district")}><option value="">Choose…</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Pincode"><input className="input" inputMode="numeric" value={f.pincode} onChange={set("pincode")} /></Field>
      </Section>
      <Section title="Electricity connection">
        <Field label="Consumer (CA) number"><input className="input" value={f.consumer_no} onChange={set("consumer_no")} /></Field>
        <Field label="DISCOM"><select className="input" value={f.discom} onChange={set("discom")}><option value="">Choose…</option>{DISCOMS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Sanctioned load (kW)"><input className="input" inputMode="decimal" value={f.sanctioned_load_kw} onChange={set("sanctioned_load_kw")} /></Field>
        <Field label="Phase"><select className="input" value={f.connection_phase} onChange={set("connection_phase")}><option value="">Choose…</option><option>Single phase</option><option>Three phase</option></select></Field>
      </Section>
      <Section title="Co-applicant (for loans)">
        <Field label="Name"><input className="input" value={f.co_applicant_name} onChange={set("co_applicant_name")} /></Field>
        <Field label="Relation"><input className="input" value={f.co_applicant_relation} onChange={set("co_applicant_relation")} /></Field>
      </Section>
      <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
    </Sheet>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-1 text-sm font-bold text-ink">{title}</legend>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

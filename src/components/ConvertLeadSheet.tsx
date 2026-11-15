import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { estimateFromBill } from "../lib/estimate";
import { useEstimateSettings } from "../lib/queries";
import { SYSTEM_TYPES } from "../lib/projects";
import { rupees } from "../lib/format";
import type { Lead } from "../lib/types";
import { Button, Field, Segmented, Sheet, friendlyError, useToast } from "./ui";

/** One step: the lead becomes a customer and a project is opened with every detail carried over. */
export function ConvertLeadSheet({ open, onClose, lead, surveyKw }: { open: boolean; onClose: () => void; lead: Lead; surveyKw?: number | null }) {
  const { data: est } = useEstimateSettings();
  const suggestion = surveyKw ?? (lead.monthly_bill && est ? estimateFromBill(lead.monthly_bill, est, lead.customer_type).kw : null);
  const [f, setF] = useState({ capacity: "", system: "On-grid", cost: "", finance: "Cash" as "Cash" | "Bank loan", father: "", consumer: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  useEffect(() => {
    if (open) setF((x) => ({ ...x, capacity: x.capacity || (suggestion ? String(suggestion) : ""), cost: x.cost || (lead.deal_value ? String(lead.deal_value) : "") }));
  }, [open, suggestion, lead.deal_value]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function go() {
    const e: Record<string, string> = {};
    const kw = Number(f.capacity), cost = Number(f.cost);
    if (!(kw > 0 && kw < 1000)) e.capacity = "Enter the system size in kW";
    if (f.cost !== "" && !(cost >= 0)) e.cost = "Enter a valid amount";
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("convert_lead", {
      p_lead: lead.id, p_capacity: kw, p_system_type: f.system, p_total_cost: f.cost === "" ? null : cost, p_finance: f.finance,
      p_father_name: f.father.trim() || null, p_consumer_no: f.consumer.trim() || null,
    });
    setBusy(false);
    if (error) { toast(friendlyError(error), "error"); return; }
    ["lead", "leads", "activities", "projects", "lead_project"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Customer and project created");
    onClose();
    nav(`/projects/${data}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Convert ${lead.name} to customer`}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={go}>Create customer &amp; project</Button></>}>
      <p className="mb-4 rounded-xl bg-blue-tint px-3 py-2.5 text-sm text-ink">
        Name, phone, address, DISCOM, partner, survey photos and documents all carry over. The lead is marked <b>Won</b>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="System size (kW)" error={errors.capacity} hint={suggestion ? `Suggested: ${suggestion} kW` : undefined}>
          <input className="input" inputMode="decimal" value={f.capacity} onChange={set("capacity")} />
        </Field>
        <Field label="Total project cost (₹)" error={errors.cost} hint={f.cost ? rupees(Number(f.cost)) : "Can be added later"}>
          <input className="input" inputMode="numeric" value={f.cost} onChange={set("cost")} />
        </Field>
      </div>
      <div className="mt-3">
        <span className="label">System type</span>
        <Segmented value={f.system} onChange={(v) => setF((x) => ({ ...x, system: v }))} options={SYSTEM_TYPES.map((s) => ({ value: s, label: s }))} />
      </div>
      <div className="mt-3">
        <span className="label">Payment</span>
        <Segmented value={f.finance} onChange={(v) => setF((x) => ({ ...x, finance: v }))} options={[{ value: "Cash", label: "Cash / own funds" }, { value: "Bank loan", label: "Bank loan" }]} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Father's / husband's name"><input className="input" value={f.father} onChange={set("father")} /></Field>
        <Field label="Consumer (CA) number"><input className="input" value={f.consumer} onChange={set("consumer")} /></Field>
      </div>
    </Sheet>
  );
}

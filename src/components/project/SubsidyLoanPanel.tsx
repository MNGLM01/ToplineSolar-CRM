import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Sun } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LOAN_STATUSES, SUBSIDY_STAGES, type BankLoan, type Project, type Subsidy } from "../../lib/projects";
import { subsidyFor } from "../../lib/estimate";
import { useEstimateSettings } from "../../lib/queries";
import { rupees } from "../../lib/format";
import { Button, Field, cx, friendlyError, useToast } from "../ui";

type Form = Record<string, string>;
const toForm = (o: object): Form => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)]));
const fromForm = (f: Form, numeric: string[]) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === "" ? null : numeric.includes(k) ? Number(v) : v.trim()]));

export function SubsidyLoanPanel({ project, locked }: { project: Project; locked: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SubsidyCard project={project} locked={locked} />
      <LoanCard project={project} locked={locked} />
    </div>
  );
}

function SubsidyCard({ project, locked }: { project: Project; locked: boolean }) {
  const { data } = useQuery({ queryKey: ["subsidy", project.id], queryFn: async () => (await supabase.from("subsidies").select("*").eq("project_id", project.id).maybeSingle()).data as Subsidy | null });
  const { data: est } = useEstimateSettings();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (data) { const { project_id: _p, updated_at: _u, ...rest } = data as Subsidy & { updated_at?: string }; setF(toForm(rest)); } }, [data]);
  if (!f) return <div className="card h-64" />;
  const suggested = project.customer_type === "Residential" && project.capacity_kw ? subsidyFor(project.capacity_kw, est) : null;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("subsidies").update(fromForm(f!, ["expected_amount", "received_amount"])).eq("project_id", project.id);
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { toast("Subsidy saved"); qc.invalidateQueries({ queryKey: ["subsidy", project.id] }); }
  }
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2"><Sun className="h-5 w-5 text-amber" /><h3 className="font-bold">PM Surya Ghar subsidy</h3></div>
      <StageSteps stages={SUBSIDY_STAGES.filter((s) => s !== "Rejected")} value={f.stage} rejected={f.stage === "Rejected"} />
      <fieldset disabled={locked} className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Stage" className="col-span-2"><select className="input" value={f.stage} onChange={set("stage")}>{SUBSIDY_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Application number"><input className="input" value={f.application_no} onChange={set("application_no")} /></Field>
        <Field label="Expected amount (₹)" hint={suggested ? `Slab for ${project.capacity_kw} kW: ${rupees(suggested)}` : undefined}>
          <div className="flex gap-1"><input className="input" inputMode="numeric" value={f.expected_amount} onChange={set("expected_amount")} />
            {suggested && !f.expected_amount && <Button type="button" size="sm" variant="ghost" className="h-11" onClick={() => setF({ ...f, expected_amount: String(suggested) })}>Use</Button>}</div>
        </Field>
        <Field label="Applied on"><input type="date" className="input" value={f.applied_on} onChange={set("applied_on")} /></Field>
        <Field label="Approved on"><input type="date" className="input" value={f.approved_on} onChange={set("approved_on")} /></Field>
        <Field label="Received amount (₹)"><input className="input" inputMode="numeric" value={f.received_amount} onChange={set("received_amount")} /></Field>
        <Field label="Received on"><input type="date" className="input" value={f.received_on} onChange={set("received_on")} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </fieldset>
      {!locked && <Button className="mt-4 w-full sm:w-auto" loading={busy} onClick={save}>Save subsidy</Button>}
    </div>
  );
}

function LoanCard({ project, locked }: { project: Project; locked: boolean }) {
  const { data } = useQuery({ queryKey: ["loan", project.id], queryFn: async () => (await supabase.from("bank_loans").select("*").eq("project_id", project.id).maybeSingle()).data as BankLoan | null });
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (data) { const { project_id: _p, updated_at: _u, ...rest } = data as BankLoan & { updated_at?: string }; setF(toForm(rest)); } }, [data]);
  if (project.finance_type !== "Bank loan") {
    return (
      <div className="card flex flex-col items-center justify-center p-6 text-center">
        <Landmark className="mb-2 h-6 w-6 text-muted" />
        <p className="font-semibold text-ink">No bank loan</p>
        <p className="text-sm text-muted">This customer is paying with their own funds. Change “Payment” in project details if they take a loan.</p>
      </div>
    );
  }
  if (!f) return <div className="card h-64" />;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // EMI = P·r·(1+r)^n / ((1+r)^n − 1)
  const P = Number(f.amount_approved || f.amount_requested), r = Number(f.interest_rate) / 1200, n = Number(f.tenure_months);
  const emi = P > 0 && r > 0 && n > 0 ? Math.round((P * r * (1 + r) ** n) / ((1 + r) ** n - 1)) : null;
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("bank_loans").update(fromForm({ ...f!, emi: f!.emi || (emi ? String(emi) : "") }, ["amount_requested", "amount_approved", "interest_rate", "tenure_months", "emi"])).eq("project_id", project.id);
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { toast("Loan saved"); qc.invalidateQueries({ queryKey: ["loan", project.id] }); }
  }
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2"><Landmark className="h-5 w-5 text-blue" /><h3 className="font-bold">Bank loan</h3></div>
      <StageSteps stages={LOAN_STATUSES.filter((s) => s !== "Rejected")} value={f.status} rejected={f.status === "Rejected"} />
      <fieldset disabled={locked} className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Status"><select className="input" value={f.status} onChange={set("status")}>{LOAN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Bank"><input className="input" list="banks" value={f.bank_name} onChange={set("bank_name")} placeholder="SBI, PNB…" /></Field>
        <datalist id="banks">{["State Bank of India", "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank of India", "Bank of India", "Central Bank of India", "UCO Bank", "Uttar Bihar Gramin Bank"].map((b) => <option key={b} value={b} />)}</datalist>
        <Field label="Amount requested (₹)"><input className="input" inputMode="numeric" value={f.amount_requested} onChange={set("amount_requested")} /></Field>
        <Field label="Amount approved (₹)"><input className="input" inputMode="numeric" value={f.amount_approved} onChange={set("amount_approved")} /></Field>
        <Field label="Interest (% a year)"><input className="input" inputMode="decimal" value={f.interest_rate} onChange={set("interest_rate")} /></Field>
        <Field label="Tenure (months)"><input className="input" inputMode="numeric" value={f.tenure_months} onChange={set("tenure_months")} /></Field>
        <Field label="EMI (₹)" hint={emi && !f.emi ? `Worked out: ${rupees(emi)}` : undefined}><input className="input" inputMode="numeric" value={f.emi} onChange={set("emi")} placeholder={emi ? String(emi) : ""} /></Field>
        <Field label="Loan account no."><input className="input" value={f.loan_account_no} onChange={set("loan_account_no")} /></Field>
        <Field label="Applied on"><input type="date" className="input" value={f.applied_on} onChange={set("applied_on")} /></Field>
        <Field label="Approved on"><input type="date" className="input" value={f.approved_on} onChange={set("approved_on")} /></Field>
        <Field label="Disbursed on"><input type="date" className="input" value={f.disbursed_on} onChange={set("disbursed_on")} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </fieldset>
      {!locked && <Button className="mt-4 w-full sm:w-auto" loading={busy} onClick={save}>Save loan</Button>}
    </div>
  );
}

function StageSteps({ stages, value, rejected }: { stages: string[]; value: string; rejected: boolean }) {
  const idx = stages.indexOf(value);
  return (
    <div>
      <div className="flex gap-1">
        {stages.slice(1).map((s, i) => <span key={s} className={cx("h-1.5 flex-1 rounded-full", rejected ? "bg-danger/40" : i < idx ? "bg-success" : "bg-rule/70")} />)}
      </div>
      <p className={cx("mt-1.5 text-sm font-semibold", rejected ? "text-danger" : idx >= stages.length - 1 ? "text-success" : "text-ink")}>{value}</p>
    </div>
  );
}

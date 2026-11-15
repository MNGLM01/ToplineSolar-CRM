import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useEstimateSettings, useLostReasons, useSources, useStages } from "../lib/queries";
import { useChecklistTemplate, useDocTypes } from "../lib/projects";
import type { EstimateSettings } from "../lib/types";
import { Button, Field, PageHeader, cx, friendlyError, useToast } from "../components/ui";

type Tab = "stages" | "sources" | "lost" | "checklists" | "documents" | "estimate";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("stages");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Lists and rates used across the CRM. Changes are recorded in the history." />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-ink/5 p-1">
        {([["stages", "Lead stages"], ["sources", "Lead sources"], ["lost", "Lost reasons"], ["checklists", "Checklists"], ["documents", "Document types"], ["estimate", "Solar estimate"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold", tab === k ? "bg-white text-ink shadow-sm" : "text-muted")}>{l}</button>
        ))}
      </div>
      {tab === "stages" && <StagesEditor />}
      {tab === "sources" && <SimpleList table="lead_sources" useData={useSources} queryKey="sources" />}
      {tab === "lost" && <SimpleList table="lost_reasons" useData={useLostReasons} queryKey="lost_reasons" />}
      {tab === "checklists" && <ChecklistEditor />}
      {tab === "documents" && <DocTypesEditor />}
      {tab === "estimate" && <EstimateEditor />}
    </div>
  );
}

function StagesEditor() {
  const { data: stages } = useStages();
  const qc = useQueryClient(); const toast = useToast();
  const [newName, setNewName] = useState("");
  async function patch(id: number, p: Record<string, unknown>) {
    const { error } = await supabase.from("lead_stages").update(p).eq("id", id);
    if (error) toast(friendlyError(error), "error"); else qc.invalidateQueries({ queryKey: ["stages"] });
  }
  async function swap(i: number, j: number) {
    if (!stages || j < 0 || j >= stages.length) return;
    const a = stages[i], b = stages[j];
    await supabase.from("lead_stages").update({ sort: b.sort }).eq("id", a.id);
    await supabase.from("lead_stages").update({ sort: a.sort }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["stages"] });
  }
  async function add() {
    if (!newName.trim()) return;
    const max = Math.max(0, ...(stages ?? []).map((s) => s.sort));
    const { error } = await supabase.from("lead_stages").insert({ name: newName.trim(), sort: max + 1 });
    if (error) toast(friendlyError(error), "error"); else { setNewName(""); qc.invalidateQueries({ queryKey: ["stages"] }); }
  }
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm text-muted">Rename, recolour, reorder or hide stages. "Won" and "Lost" are special and can't be hidden. Hidden stages keep their leads.</p>
      <ul className="divide-y divide-rule/70">
        {stages?.map((s, i) => (
          <li key={s.id} className={cx("flex items-center gap-2 py-2", !s.active && "opacity-50")}>
            <input type="color" value={s.color} onChange={(e) => patch(s.id, { color: e.target.value })} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-rule" aria-label="Colour" />
            <input className="input h-10" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patch(s.id, { name: e.target.value.trim() })} />
            {(s.is_won || s.is_lost) && <span className="chip bg-cloud text-muted">{s.is_won ? "Won" : "Lost"}</span>}
            <button onClick={() => swap(i, i - 1)} className="rounded-lg p-2 text-muted hover:bg-cloud" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
            <button onClick={() => swap(i, i + 1)} className="rounded-lg p-2 text-muted hover:bg-cloud" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
            {!(s.is_won || s.is_lost) && <Button size="sm" variant="ghost" onClick={() => patch(s.id, { active: !s.active })}>{s.active ? "Hide" : "Show"}</Button>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2"><input className="input" placeholder="New stage name" value={newName} onChange={(e) => setNewName(e.target.value)} /><Button onClick={add}><Plus className="h-4 w-4" />Add</Button></div>
    </div>
  );
}

function SimpleList({ table, useData, queryKey }: { table: string; useData: () => { data?: { id: number; name: string; active: boolean; sort: number }[] }; queryKey: string }) {
  const { data } = useData();
  const qc = useQueryClient(); const toast = useToast();
  const [name, setName] = useState("");
  async function run(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) toast(friendlyError(error), "error"); else qc.invalidateQueries({ queryKey: [queryKey] }); }
  return (
    <div className="card p-4">
      <ul className="divide-y divide-rule/70">
        {data?.map((r) => (
          <li key={r.id} className={cx("flex items-center gap-2 py-2", !r.active && "opacity-50")}>
            <input className="input h-10" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && run(supabase.from(table).update({ name: e.target.value.trim() }).eq("id", r.id))} />
            <Button size="sm" variant="ghost" onClick={() => run(supabase.from(table).update({ active: !r.active }).eq("id", r.id))}>{r.active ? "Hide" : "Show"}</Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="Add new" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => { if (name.trim()) { run(supabase.from(table).insert({ name: name.trim(), sort: (data?.length ?? 0) + 1 })); setName(""); } }}><Plus className="h-4 w-4" />Add</Button>
      </div>
    </div>
  );
}

function EstimateEditor() {
  const { data } = useEstimateSettings();
  const [f, setF] = useState<EstimateSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const toast = useToast();
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return null;
  const set = (k: keyof EstimateSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: Number(e.target.value) });
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "solar_estimate", value: f });
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { qc.invalidateQueries({ queryKey: ["settings"] }); toast("Rates saved"); }
  }
  return (
    <div className="card p-4">
      <p className="mb-4 text-sm text-muted">Used for the quick estimate on each lead's page. Quotations (step 3) will use your full price list.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Electricity tariff (₹ per unit)"><input className="input" inputMode="decimal" value={f.tariff_per_unit} onChange={set("tariff_per_unit")} /></Field>
        <Field label="Units per kW per month"><input className="input" inputMode="numeric" value={f.units_per_kw_month} onChange={set("units_per_kw_month")} /></Field>
        <Field label="Approx. cost per kW (₹)"><input className="input" inputMode="numeric" value={f.cost_per_kw} onChange={set("cost_per_kw")} /></Field>
        <Field label="Subsidy per kW, first 2 kW (₹)"><input className="input" inputMode="numeric" value={f.subsidy_per_kw_first_2} onChange={set("subsidy_per_kw_first_2")} /></Field>
        <Field label="Subsidy for 3rd kW (₹)"><input className="input" inputMode="numeric" value={f.subsidy_third_kw} onChange={set("subsidy_third_kw")} /></Field>
        <Field label="Maximum subsidy (₹)"><input className="input" inputMode="numeric" value={f.subsidy_max} onChange={set("subsidy_max")} /></Field>
      </div>
      <Button className="mt-4" loading={busy} onClick={save}>Save rates</Button>
    </div>
  );
}

function ChecklistEditor() {
  const { data } = useChecklistTemplate();
  const qc = useQueryClient(); const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  async function run(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) toast(friendlyError(error), "error"); else qc.invalidateQueries({ queryKey: ["checklist_template"] }); }
  if (!data) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Tick-lists for each project. Changes apply to projects created from now on; existing projects keep their list.</p>
      {data.stages.map((st) => {
        const items = data.items.filter((i) => i.stage_id === st.id);
        return (
          <div key={st.id} className="card p-4">
            <input className="input mb-2 h-10 font-bold" defaultValue={st.name} onBlur={(e) => e.target.value.trim() && e.target.value !== st.name && run(supabase.from("checklist_stages").update({ name: e.target.value.trim() }).eq("id", st.id))} />
            <ul className="divide-y divide-rule/70">
              {items.map((i) => (
                <li key={i.id} className={cx("flex items-center gap-2 py-2", !i.active && "opacity-50")}>
                  <input className="input h-10" defaultValue={i.text} onBlur={(e) => e.target.value.trim() && e.target.value !== i.text && run(supabase.from("checklist_items").update({ text: e.target.value.trim() }).eq("id", i.id))} />
                  <button onClick={() => run(supabase.from("checklist_items").update({ required: !i.required }).eq("id", i.id))}
                    className={cx("chip h-8 shrink-0 border", i.required ? "border-orange/40 bg-orange-tint text-orange-dark" : "border-rule bg-white text-muted")}>{i.required ? "Required" : "Optional"}</button>
                  <Button size="sm" variant="ghost" onClick={() => run(supabase.from("checklist_items").update({ active: !i.active }).eq("id", i.id))}>{i.active ? "Hide" : "Show"}</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className="input h-10" placeholder="Add an item" value={drafts[st.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [st.id]: e.target.value })} />
              <Button size="sm" className="h-10" onClick={() => { const t = drafts[st.id]?.trim(); if (t) { run(supabase.from("checklist_items").insert({ stage_id: st.id, text: t, sort: items.length + 1 })); setDrafts({ ...drafts, [st.id]: "" }); } }}><Plus className="h-4 w-4" />Add</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DOC_CATEGORIES = ["kyc", "electricity", "bank", "property", "loan", "survey", "installation", "portal", "other"];
function DocTypesEditor() {
  const { data } = useDocTypes();
  const qc = useQueryClient(); const toast = useToast();
  const [name, setName] = useState("");
  async function run(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) toast(friendlyError(error), "error"); else qc.invalidateQueries({ queryKey: ["document_types"] }); }
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm text-muted">“Required” documents make up each customer's document checklist and % complete. “Loan only” ones are asked for only when the customer takes a bank loan.</p>
      <ul className="divide-y divide-rule/70">
        {data?.map((t) => (
          <li key={t.id} className={cx("flex flex-wrap items-center gap-2 py-2", !t.active && "opacity-50")}>
            <input className="input h-10 min-w-[180px] flex-1" defaultValue={t.name} disabled={t.name === "Installation photo"} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && run(supabase.from("document_types").update({ name: e.target.value.trim() }).eq("id", t.id))} />
            <select className="input h-10 w-auto" value={t.category} onChange={(e) => run(supabase.from("document_types").update({ category: e.target.value }).eq("id", t.id))}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <button onClick={() => run(supabase.from("document_types").update({ required: !t.required }).eq("id", t.id))} className={cx("chip h-8 border", t.required ? "border-orange/40 bg-orange-tint text-orange-dark" : "border-rule bg-white text-muted")}>{t.required ? "Required" : "Optional"}</button>
            <button onClick={() => run(supabase.from("document_types").update({ loan_only: !t.loan_only }).eq("id", t.id))} className={cx("chip h-8 border", t.loan_only ? "border-blue/40 bg-blue-tint text-blue" : "border-rule bg-white text-muted")}>{t.loan_only ? "Loan only" : "Everyone"}</button>
            {t.name !== "Installation photo" && <Button size="sm" variant="ghost" onClick={() => run(supabase.from("document_types").update({ active: !t.active }).eq("id", t.id))}>{t.active ? "Hide" : "Show"}</Button>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="New document type" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => { if (name.trim()) { run(supabase.from("document_types").insert({ name: name.trim(), sort: (data?.length ?? 0) + 1 })); setName(""); } }}><Plus className="h-4 w-4" />Add</Button>
      </div>
    </div>
  );
}

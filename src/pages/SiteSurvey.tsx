import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Crosshair, MapPin, Ruler, Sun } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useLead } from "../lib/leads";
import { useDraft } from "../lib/draft";
import { useEstimateSettings, useStages } from "../lib/queries";
import { estimateFromBill } from "../lib/estimate";
import { fmtDateTime } from "../lib/format";
import { DISCOMS, ROOF_TYPES } from "../lib/types";
import type { SiteSurvey as Survey } from "../lib/projects";
import { Button, Empty, Field, PageLoader, Segmented, cx, friendlyError, useToast } from "../components/ui";
import { DocumentsPanel } from "../components/project/DocumentsPanel";

const KEYS = ["roof_type", "roof_condition", "roof_floor", "roof_length_ft", "roof_width_ft", "usable_area_sqft", "roof_direction", "shadow_notes",
  "sanctioned_load_kw", "connection_phase", "discom", "consumer_no", "meter_location", "inverter_location", "earthing_location", "roof_to_meter_m",
  "structure_type", "recommended_kw", "remarks", "latitude", "longitude"] as const;
type Form = Record<(typeof KEYS)[number], string>;
const NUM = ["roof_floor", "roof_length_ft", "roof_width_ft", "usable_area_sqft", "sanctioned_load_kw", "roof_to_meter_m", "recommended_kw", "latitude", "longitude"];
const EMPTY = Object.fromEntries(KEYS.map((k) => [k, ""])) as Form;
const SQFT_PER_KW = 100; // shadow-free roof area needed per kW of panels

/** Works on a phone at the customer's house. Keeps a draft on the device if the signal drops. */
export default function SiteSurvey() {
  const { id } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const { profile } = useAuth();
  const { data: lead, isLoading } = useLead(id);
  const { data: stages } = useStages();
  const { data: est } = useEstimateSettings();
  const { data: existing, isLoading: l2 } = useQuery({
    queryKey: ["survey", id], enabled: !!id,
    queryFn: async () => (await supabase.from("site_surveys").select("*").eq("lead_id", id!).maybeSingle()).data as Survey | null,
  });
  const [f, setF, clearDraft, hasDraft] = useDraft<Form>(`survey:${id}`, EMPTY);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<"" | "finding" | "error">("");

  // Fill from the saved survey (or from the lead) unless a newer draft is on this device
  useEffect(() => {
    if (hasDraft || l2 || !lead) return;
    if (existing) setF(Object.fromEntries(KEYS.map((k) => [k, existing[k] == null ? "" : String(existing[k])])) as Form);
    else setF((x) => ({ ...x, roof_type: lead.roof_type ?? "", sanctioned_load_kw: lead.sanctioned_load_kw?.toString() ?? "", discom: lead.discom ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, l2, lead]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const area = f.usable_area_sqft ? Number(f.usable_area_sqft) : f.roof_length_ft && f.roof_width_ft ? Math.round(Number(f.roof_length_ft) * Number(f.roof_width_ft) * 0.8) : null;
  const roofKw = area ? Math.floor((area / SQFT_PER_KW) * 2) / 2 : null;
  const billKw = lead?.monthly_bill && est ? estimateFromBill(lead.monthly_bill, est, lead.customer_type).kw : null;
  const loadKw = f.sanctioned_load_kw ? Number(f.sanctioned_load_kw) : null;
  const suggestion = [roofKw, billKw].filter((x): x is number => !!x).reduce((a, b) => Math.min(a, b), Infinity);
  const suggested = Number.isFinite(suggestion) ? suggestion : null;

  function locate() {
    if (!navigator.geolocation) { setGps("error"); return; }
    setGps("finding");
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setGps(""); },
      () => setGps("error"), { enableHighAccuracy: true, timeout: 15000 });
  }
  // capture GPS automatically the first time the survey is opened
  useEffect(() => { if (!l2 && !existing && !f.latitude) locate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [l2]);

  async function save() {
    setBusy(true);
    const row: Record<string, unknown> = { lead_id: id, surveyed_at: existing?.surveyed_at ?? new Date().toISOString() };
    for (const k of KEYS) row[k] = f[k].trim() === "" ? null : NUM.includes(k) ? Number(f[k]) : f[k].trim();
    if (row.usable_area_sqft == null && area) row.usable_area_sqft = area;
    if (row.recommended_kw == null && suggested) row.recommended_kw = suggested;
    if (!existing) row.surveyor_id = profile?.id;
    const { error } = await supabase.from("site_surveys").upsert(row, { onConflict: "lead_id" });
    if (error) { setBusy(false); toast(friendlyError(error), "error"); return; }
    // move the lead forward to "Site Survey Done" if it's earlier in the pipeline
    const done = stages?.find((s) => s.name === "Site Survey Done");
    const cur = stages?.find((s) => s.id === lead?.stage_id);
    if (done && cur && !cur.is_won && !cur.is_lost && cur.sort < done.sort) await supabase.from("leads").update({ stage_id: done.id }).eq("id", id!);
    setBusy(false); clearDraft();
    ["survey", "lead", "leads", "activities"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast("Survey saved"); nav(`/leads/${id}`);
  }

  const unsaved = hasDraft && KEYS.some((k) => f[k] !== (existing?.[k] == null ? "" : String(existing[k])));

  if (isLoading || l2) return <PageLoader />;
  if (!lead) return <Empty title="Lead not found" action={<Link to="/leads"><Button variant="secondary">Back to leads</Button></Link>} />;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold">Site survey</h1>
        <p className="text-sm text-muted">{lead.name} · {[lead.village, lead.district].filter(Boolean).join(", ")}{existing?.surveyed_at ? ` · surveyed ${fmtDateTime(existing.surveyed_at)}` : ""}</p>
        {unsaved && <p className="mt-1 text-xs font-medium text-orange-dark">You have unsaved changes on this phone. Tap “Save survey” to keep them.</p>}
      </div>

      {/* Location */}
      <div className="card mb-4 flex items-center gap-3 p-4">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", f.latitude ? "bg-success-tint text-success" : "bg-cloud text-muted")}><MapPin className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{f.latitude ? "Location captured" : gps === "finding" ? "Finding location…" : "Location not captured"}</p>
          <p className="truncate text-xs text-muted">
            {f.latitude ? <a className="text-blue" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`}>{f.latitude}, {f.longitude}</a>
              : gps === "error" ? "Allow location access in the browser, then try again." : "Stand on the roof or at the gate."}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={locate} loading={gps === "finding"}><Crosshair className="h-4 w-4" />{f.latitude ? "Update" : "Capture"}</Button>
      </div>

      <Card title="Roof" icon={<Ruler className="h-4 w-4 text-blue" />}>
        <Group label="Roof type" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">{ROOF_TYPES.map((r) => <Chip key={r} on={f.roof_type === r} onClick={() => setF((x) => ({ ...x, roof_type: x.roof_type === r ? "" : r }))}>{r}</Chip>)}</div>
        </Group>
        <Group label="Condition"><Segmented value={f.roof_condition} onChange={(v) => setF((x) => ({ ...x, roof_condition: v }))} options={["Good", "Average", "Needs repair"].map((v) => ({ value: v, label: v }))} /></Group>
        <Field label="Floors (G = 0)"><input className="input" inputMode="numeric" value={f.roof_floor} onChange={set("roof_floor")} /></Field>
        <Field label="Length (ft)"><input className="input" inputMode="decimal" value={f.roof_length_ft} onChange={set("roof_length_ft")} /></Field>
        <Field label="Width (ft)"><input className="input" inputMode="decimal" value={f.roof_width_ft} onChange={set("roof_width_ft")} /></Field>
        <Field label="Usable shadow-free area (sq ft)" hint={!f.usable_area_sqft && area ? `About ${area} sq ft (80% of the roof)` : undefined}><input className="input" inputMode="numeric" value={f.usable_area_sqft} onChange={set("usable_area_sqft")} placeholder={area ? String(area) : ""} /></Field>
        <Field label="Panels will face"><select className="input" value={f.roof_direction} onChange={set("roof_direction")}><option value="">Choose…</option>{["South", "South-East", "South-West", "East", "West", "Flat (south tilt)"].map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Shadow notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.shadow_notes} onChange={set("shadow_notes")} placeholder="Trees, water tank, neighbouring building, morning or evening shade" /></Field>
      </Card>

      <Card title="Electricity connection">
        <Field label="Sanctioned load (kW)"><input className="input" inputMode="decimal" value={f.sanctioned_load_kw} onChange={set("sanctioned_load_kw")} /></Field>
        <Group label="Phase"><Segmented value={f.connection_phase} onChange={(v) => setF((x) => ({ ...x, connection_phase: v }))} options={[{ value: "Single phase", label: "Single" }, { value: "Three phase", label: "Three" }]} /></Group>
        <Group label="DISCOM"><Segmented value={f.discom} onChange={(v) => setF((x) => ({ ...x, discom: v }))} options={DISCOMS.map((d) => ({ value: d, label: d }))} /></Group>
        <Field label="Consumer (CA) number"><input className="input" value={f.consumer_no} onChange={set("consumer_no")} /></Field>
      </Card>

      <Card title="Positions">
        <Field label="Meter location"><input className="input" value={f.meter_location} onChange={set("meter_location")} placeholder="Ground floor, outside gate" /></Field>
        <Field label="Inverter location"><input className="input" value={f.inverter_location} onChange={set("inverter_location")} placeholder="Staircase wall" /></Field>
        <Field label="Earthing position"><input className="input" value={f.earthing_location} onChange={set("earthing_location")} placeholder="Back yard, 2 pits" /></Field>
        <Field label="Roof to meter cable (m)"><input className="input" inputMode="decimal" value={f.roof_to_meter_m} onChange={set("roof_to_meter_m")} /></Field>
        <Field label="Structure needed" className="sm:col-span-2"><input className="input" value={f.structure_type} onChange={set("structure_type")} placeholder="Elevated GI, standard, tin-shed clamps…" /></Field>
      </Card>

      {/* Suggestion */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 bg-navy px-4 py-3 text-white"><Sun className="h-4 w-4 text-amber" /><h3 className="font-bold text-white">Suggested system size</h3></div>
        <div className="grid grid-cols-3 gap-px bg-rule text-center">
          <Mini label="Roof fits" v={roofKw ? `${roofKw} kW` : "—"} />
          <Mini label="Bill needs" v={billKw ? `${billKw} kW` : "—"} />
          <Mini label="Sanctioned load" v={loadKw ? `${loadKw} kW` : "—"} />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Recommended (kW)" hint={suggested ? `Suggested ${suggested} kW. This carries over to the project.` : "Add roof size to get a suggestion"}>
            <input className="input text-lg font-bold" inputMode="decimal" value={f.recommended_kw} onChange={set("recommended_kw")} placeholder={suggested ? String(suggested) : ""} />
          </Field>
          {loadKw && suggested && suggested > loadKw && <p className="self-end rounded-lg bg-orange-tint px-3 py-2 text-xs text-orange-dark">Above the sanctioned load. The customer may need a load increase from the DISCOM.</p>}
        </div>
      </div>

      <Card title="Remarks"><Field label="Anything else" className="sm:col-span-2"><textarea className="input" rows={3} value={f.remarks} onChange={set("remarks")} /></Field></Card>

      <div className="mb-2 mt-6"><h3 className="font-bold">Photos</h3><p className="text-sm text-muted">Roof, meter, electricity bill and a sketch. They move to the project when the lead is converted.</p></div>
      <DocumentsPanel scope={{ leadId: lead.id }} zipName={`Survey ${lead.name}`} only={["Site survey photo", "Electricity bill", "Other"]} />

      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 mt-6 border-t border-rule bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border">
        <Button size="lg" className="w-full" loading={busy} onClick={save}>Save survey</Button>
      </div>
    </div>
  );
}

function Group({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><span className="label">{label}</span>{children}</div>;
}
function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="card mb-4 p-4"><h3 className="mb-3 flex items-center gap-2 font-bold">{icon}{title}</h3><div className="grid gap-3 sm:grid-cols-2">{children}</div></div>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cx("h-9 rounded-xl border px-3 text-sm font-medium transition", on ? "border-blue bg-blue-tint text-blue" : "border-rule bg-white text-body")}>{children}</button>;
}
function Mini({ label, v }: { label: string; v: string }) {
  return <div className="bg-white px-2 py-3"><p className="text-xs text-muted">{label}</p><p className="font-bold tabular-nums text-ink">{v}</p></div>;
}

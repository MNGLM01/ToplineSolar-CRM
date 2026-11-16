import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Phone, MessageCircle, MapPin, CalendarPlus, PhoneCall, Pencil, Trash2, Sun, CheckCircle2, StickyNote, ArrowRightLeft, UserCheck, Clock, Send, ClipboardList, FolderKanban, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { useLead } from "../lib/leads";
import { assignable, useEstimateSettings, useLostReasons, usePartners, useProfiles, useSources, useStages } from "../lib/queries";
import { estimateFromBill } from "../lib/estimate";
import { fmtDate, fmtDateTime, fmtPhone, isOverdue, relTime, rupees, telLink, waLink } from "../lib/format";
import { moveStage } from "../lib/moveStage";
import type { Activity, Followup } from "../lib/types";
import { Avatar, Button, Empty, PageLoader, TempBadge, cx, friendlyError, useToast } from "../components/ui";
import { FollowupSheet } from "../components/FollowupSheet";
import { CompleteFollowupSheet } from "../components/CompleteFollowupSheet";
import { LostReasonSheet } from "../components/LostReasonSheet";
import { EditLeadSheet } from "../components/EditLeadSheet";
import { LogCallSheet } from "../components/LogCallSheet";
import { ConvertLeadSheet } from "../components/ConvertLeadSheet";
import { QuotesCard } from "../components/QuotesCard";
import { TasksCard } from "../components/tasks/TaskList";
import type { SiteSurvey } from "../lib/projects";

export default function LeadDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const p = can(profile?.role);
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: lead, isLoading } = useLead(id);
  const { data: stages } = useStages();
  const { data: sources } = useSources();
  const { data: profiles } = useProfiles();
  const { data: partners } = usePartners(p.managePartners || profile?.role === "sales");
  const { data: reasons } = useLostReasons();
  const { data: est } = useEstimateSettings();
  const [sheet, setSheet] = useState<"" | "followup" | "edit" | "lost" | "call" | "convert">("");
  const [completing, setCompleting] = useState<Followup | null>(null);
  const [note, setNote] = useState("");

  const { data: activities } = useQuery({
    queryKey: ["activities", id], enabled: !!id,
    queryFn: async () => (await supabase.from("lead_activities").select("*").eq("lead_id", id!).order("created_at", { ascending: false }).limit(200)).data as Activity[],
  });
  const { data: followups } = useQuery({
    queryKey: ["followups", "lead", id], enabled: !!id,
    queryFn: async () => (await supabase.from("followups").select("*").eq("lead_id", id!).eq("status", "pending").order("due_at")).data as Followup[],
  });

  const { data: project } = useQuery({
    queryKey: ["lead_project", id], enabled: !!id,
    queryFn: async () => (await supabase.from("projects").select("id, project_no, status_id").eq("lead_id", id!).is("deleted_at", null).maybeSingle()).data as { id: string; project_no: string } | null,
  });
  const { data: survey } = useQuery({
    queryKey: ["survey", id], enabled: !!id,
    queryFn: async () => (await supabase.from("site_surveys").select("*").eq("lead_id", id!).maybeSingle()).data as SiteSurvey | null,
  });

  const stage = stages?.find((s) => s.id === lead?.stage_id);
  const estimate = useMemo(() => (lead?.monthly_bill && est ? estimateFromBill(lead.monthly_bill, est, lead.customer_type) : null), [lead, est]);
  const userName = (uid: string | null) => profiles?.find((x) => x.id === uid)?.full_name ?? "System";

  const refresh = () => ["lead", "leads", "activities", "followups"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  async function update(patch: Record<string, unknown>, msg: string) {
    const { error } = await supabase.from("leads").update(patch).eq("id", id!);
    if (error) toast(friendlyError(error), "error"); else { toast(msg); refresh(); }
  }
  async function changeStage(sid: number) {
    if (stages?.find((s) => s.id === sid)?.is_lost) { setSheet("lost"); return; }
    try {
      await moveStage(id!, sid); toast("Stage updated"); refresh();
      if (stages?.find((s) => s.id === sid)?.is_won && !project) setSheet("convert");
    } catch (e) { toast(friendlyError(e), "error"); }
  }
  async function addNote() {
    if (!note.trim()) return;
    const { error } = await supabase.from("lead_activities").insert({ lead_id: id, type: "note", body: note.trim() });
    if (error) toast(friendlyError(error), "error"); else { setNote(""); refresh(); }
  }
  async function trash() {
    if (!confirm("Move this lead to the trash? You can restore it from Trash.")) return;
    const { error } = await supabase.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id!);
    if (error) toast(friendlyError(error), "error"); else { toast("Moved to trash"); qc.invalidateQueries({ queryKey: ["leads"] }); nav("/leads"); }
  }

  if (isLoading) return <PageLoader />;
  if (!lead) return <Empty title="Lead not found" text="It may have been deleted, or it isn't assigned to you." action={<Link to="/leads"><Button variant="secondary">Back to leads</Button></Link>} />;

  const place = [lead.address, lead.village, lead.district !== lead.village ? lead.district : null, lead.pincode].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place + ", Bihar")}`;
  const lostReason = reasons?.find((r) => r.id === lead.lost_reason_id)?.name;
  const nextF = followups?.[0];

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>

      {/* Header */}
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar name={lead.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold sm:text-2xl">{lead.name}</h1>
              <TempBadge t={lead.temperature} />
            </div>
            <p className="text-sm text-muted">{lead.lead_no} · added {fmtDate(lead.created_at)} · {sources?.find((s) => s.id === lead.source_id)?.name ?? "No source"}</p>
          </div>
          <button onClick={() => setSheet("edit")} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-blue hover:bg-blue-tint"><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Edit</span></button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <ActionBtn href={telLink(lead.phone)} icon={<Phone className="h-5 w-5" />} label="Call" tone="blue" />
          <ActionBtn href={waLink(lead.whatsapp || lead.phone, `Namaste ${lead.name.split(" ")[0]} ji, Topline Solar se baat kar rahe hain.`)} icon={<MessageCircle className="h-5 w-5" />} label="WhatsApp" tone="green" external />
          <ActionBtn href={place ? mapUrl : undefined} icon={<MapPin className="h-5 w-5" />} label="Map" tone="navy" external />
          <ActionBtn onClick={() => setSheet("followup")} icon={<CalendarPlus className="h-5 w-5" />} label="Follow-up" tone="orange" />
        </div>

        <div className="mt-4 grid gap-3 border-t border-rule pt-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Stage</span>
            <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: stage?.color }} />
            <select className="input pl-8 font-semibold" value={lead.stage_id} onChange={(e) => changeStage(Number(e.target.value))}>
              {stages?.filter((s) => s.active || s.id === lead.stage_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            </div>
          </label>
          <label className="block">
            <span className="label">Interest</span>
            <div className="flex gap-1.5">
              {(["hot", "warm", "cold"] as const).map((t) => (
                <button key={t} onClick={() => update({ temperature: lead.temperature === t ? null : t }, "Updated")}
                  className={cx("h-11 flex-1 rounded-xl border text-sm font-semibold capitalize transition",
                    lead.temperature === t ? (t === "hot" ? "border-danger bg-danger-tint text-danger" : t === "warm" ? "border-orange bg-orange-tint text-orange-dark" : "border-blue bg-blue-tint text-blue") : "border-rule text-muted")}>{t}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="label">Assigned to</span>
            {p.assignLeads ? (
              <select className="input" value={lead.assigned_to ?? ""} onChange={(e) => update({ assigned_to: e.target.value || null }, "Lead reassigned")}>
                <option value="">Not assigned</option>
                {assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            ) : <div className="input flex items-center bg-cloud">{userName(lead.assigned_to)}</div>}
          </label>
        </div>
        {stage?.is_lost && lostReason && <p className="mt-3 rounded-lg bg-cloud px-3 py-2 text-sm">Lost reason: <b className="text-ink">{lostReason}</b></p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          {/* Survey and conversion */}
          <div className="card p-4">
            {project ? (
              <Link to={`/projects/${project.id}`} className="flex items-center gap-3 rounded-xl bg-success-tint p-3">
                <FolderKanban className="h-5 w-5 text-success" />
                <span className="flex-1"><span className="block text-sm font-semibold text-ink">Customer · project {project.project_no}</span><span className="block text-xs text-muted">Open the project</span></span>
                <span className="text-success">→</span>
              </Link>
            ) : !stage?.is_lost && (
              <Button className="w-full" variant={stage?.is_won ? "primary" : "secondary"} onClick={() => setSheet("convert")}><UserPlus className="h-4 w-4" />Convert to customer</Button>
            )}
            <Link to={`/leads/${lead.id}/survey`} className="mt-3 flex items-center gap-3 rounded-xl border border-rule p-3 hover:bg-cloud">
              <ClipboardList className="h-5 w-5 text-blue" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">{survey ? "Site survey done" : "Do site survey"}</span>
                <span className="block text-xs text-muted">{survey ? `${fmtDate(survey.surveyed_at)}${survey.recommended_kw ? ` · ${survey.recommended_kw} kW recommended` : ""}` : "Roof, meter, GPS and photos, on your phone"}</span>
              </span>
              <span className="text-muted">→</span>
            </Link>
          </div>

          {!stage?.is_lost && <QuotesCard leadId={lead.id} suggestedKw={survey?.recommended_kw} projectId={project?.id} />}

          {/* Next follow-up */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Follow-up</h3>
              <button onClick={() => setSheet("followup")} className="flex items-center gap-1 text-sm font-semibold text-blue"><CalendarPlus className="h-4 w-4" />Schedule</button>
            </div>
            {nextF ? (
              <div className={cx("rounded-xl p-3", isOverdue(nextF.due_at) ? "bg-danger-tint" : "bg-blue-tint")}>
                <p className={cx("text-sm font-semibold", isOverdue(nextF.due_at) ? "text-danger" : "text-blue")}>{isOverdue(nextF.due_at) ? "Overdue · " : ""}{relTime(nextF.due_at)}</p>
                <p className="text-sm text-ink">{nextF.title.split(" · ")[0]}{nextF.note ? `: ${nextF.note}` : ""}</p>
                <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => setCompleting(nextF)}><CheckCircle2 className="h-4 w-4" />Mark done</Button>
              </div>
            ) : <p className="text-sm text-muted">No follow-up scheduled. Every open lead should have one.</p>}
            {followups && followups.length > 1 && <p className="mt-2 text-xs text-muted">+{followups.length - 1} more scheduled</p>}
          </div>

          <TasksCard preset={{ leadId: lead.id, leadName: lead.name }} />

          {/* Estimate */}
          {estimate && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 bg-navy px-4 py-3 text-white"><Sun className="h-4 w-4 text-amber" /><h3 className="font-bold text-white">Quick solar estimate</h3></div>
              <div className="grid grid-cols-2 gap-px bg-rule">
                <Stat label="Suggested system" value={`${estimate.kw} kW`} big />
                <Stat label="Monthly saving" value={rupees(estimate.monthlySavings)} big />
                <Stat label="Approx. cost" value={rupees(estimate.cost)} />
                <Stat label="PM Surya Ghar subsidy" value={rupees(estimate.subsidy)} />
                <Stat label="Net cost" value={rupees(estimate.net)} />
                <Stat label="Payback" value={`${estimate.paybackYears.toFixed(1)} years`} />
              </div>
              <p className="px-4 py-2 text-xs text-muted">From a bill of {rupees(lead.monthly_bill)}/month. A rough guide for the first conversation, not a quotation.</p>
            </div>
          )}

          {/* Details */}
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">Details</h3><button onClick={() => setSheet("edit")} className="text-sm font-semibold text-blue">Edit</button></div>
            <dl className="divide-y divide-rule/70 text-sm">
              <Row k="Mobile" v={fmtPhone(lead.phone)} />
              {lead.whatsapp && lead.whatsapp !== lead.phone && <Row k="WhatsApp" v={fmtPhone(lead.whatsapp)} />}
              {lead.alt_phone && <Row k="Alternate" v={fmtPhone(lead.alt_phone)} />}
              <Row k="Address" v={place || "—"} />
              <Row k="Monthly bill" v={rupees(lead.monthly_bill)} />
              <Row k="Customer type" v={lead.customer_type} />
              <Row k="Roof" v={lead.roof_type ?? "—"} />
              {lead.sanctioned_load_kw != null && <Row k="Sanctioned load" v={`${lead.sanctioned_load_kw} kW`} />}
              {lead.discom && <Row k="DISCOM" v={lead.discom} />}
              {lead.email && <Row k="Email" v={lead.email} />}
              {lead.partner_id && <Row k="Referred by" v={partners?.find((x) => x.id === lead.partner_id)?.name ?? "Partner"} />}
              {lead.notes && <Row k="Notes" v={lead.notes} />}
            </dl>
          </div>
        </div>

        {/* Timeline */}
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold">Timeline</h3>
            <Button size="sm" variant="secondary" onClick={() => setSheet("call")}><PhoneCall className="h-4 w-4" />Log a call</Button>
          </div>
          <div className="mb-4 flex gap-2">
            <input className="input" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <Button onClick={addNote} disabled={!note.trim()} aria-label="Add note"><Send className="h-4 w-4" /></Button>
          </div>
          <ol className="relative space-y-4 border-l-2 border-rule pl-5">
            {activities?.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-cloud text-muted">{activityIcon(a.type)}</span>
                <p className="whitespace-pre-wrap text-[15px] text-ink">{a.body}</p>
                <p className="text-xs text-muted">{userName(a.user_id)} · {fmtDateTime(a.created_at)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {p.deleteRecords && <div className="mt-6 flex justify-end"><Button variant="danger" size="sm" onClick={trash}><Trash2 className="h-4 w-4" />Move to trash</Button></div>}

      <FollowupSheet open={sheet === "followup"} onClose={() => setSheet("")} leadId={lead.id} leadName={lead.name} />
      <CompleteFollowupSheet f={completing} onClose={() => setCompleting(null)} onScheduleNext={() => setSheet("followup")} />
      <LostReasonSheet open={sheet === "lost"} onClose={() => setSheet("")}
        onConfirm={async (reasonId, n) => { setSheet(""); const lost = stages?.find((s) => s.is_lost); if (!lost) return; try { await moveStage(lead.id, lost.id, { reasonId, note: n }); toast("Marked as lost"); refresh(); } catch (e) { toast(friendlyError(e), "error"); } }} />
      <EditLeadSheet open={sheet === "edit"} onClose={() => setSheet("")} lead={lead} />
      <ConvertLeadSheet open={sheet === "convert"} onClose={() => setSheet("")} lead={lead} surveyKw={survey?.recommended_kw} />
      <LogCallSheet open={sheet === "call"} onClose={() => setSheet("")} leadId={lead.id} onScheduleNext={() => setSheet("followup")} />
    </div>
  );
}

function activityIcon(t: string) {
  const c = "h-3 w-3";
  if (t === "call") return <PhoneCall className={c} />;
  if (t === "whatsapp") return <MessageCircle className={c} />;
  if (t === "visit") return <MapPin className={c} />;
  if (t === "stage_change") return <ArrowRightLeft className={c} />;
  if (t === "assignment") return <UserCheck className={c} />;
  if (t === "followup") return <Clock className={c} />;
  return <StickyNote className={c} />;
}

function ActionBtn({ href, onClick, icon, label, tone, external }: { href?: string; onClick?: () => void; icon: ReactNode; label: string; tone: "blue" | "green" | "navy" | "orange"; external?: boolean }) {
  const cls = cx("flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition active:scale-95",
    tone === "blue" ? "bg-blue-tint text-blue" : tone === "green" ? "bg-success-tint text-success" : tone === "orange" ? "bg-orange-tint text-orange-dark" : "bg-cloud text-navy",
    !href && !onClick && "pointer-events-none opacity-40");
  return href ? <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{icon}{label}</a>
    : <button onClick={onClick} className={cls}>{icon}{label}</button>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>;
}
function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return <div className="bg-white px-4 py-3"><p className="text-xs text-muted">{label}</p><p className={cx("font-bold tabular-nums text-ink", big ? "text-lg" : "text-[15px]")}>{value}</p></div>;
}

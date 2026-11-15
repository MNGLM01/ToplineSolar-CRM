import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, LockOpen, MapPin, MessageCircle, Pencil, Phone, Trash2, Zap } from "lucide-react";
import { supabase } from "../lib/supabase";
import { can, useAuth } from "../lib/auth";
import { useProfiles } from "../lib/queries";
import { daysSince, useProject, useProjectStatuses } from "../lib/projects";
import { fmtDate, fmtPhone, rupees, telLink, waLink } from "../lib/format";
import { Avatar, Button, Empty, PageLoader, cx, friendlyError, useToast } from "../components/ui";
import { MilestoneTracker } from "../components/project/MilestoneTracker";
import { ChecklistPanel } from "../components/project/ChecklistPanel";
import { DocumentsPanel } from "../components/project/DocumentsPanel";
import { SubsidyLoanPanel } from "../components/project/SubsidyLoanPanel";
import { HistoryPanel } from "../components/project/HistoryPanel";
import { PaymentsPanel } from "../components/project/PaymentsPanel";
import { QuotesCard } from "../components/QuotesCard";
import { EditCustomerSheet, EditProjectSheet } from "../components/project/EditProjectSheet";

type Tab = "overview" | "payments" | "checklist" | "documents" | "subsidy" | "history";

export default function ProjectDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const p = can(profile?.role);
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "overview";
  const setTab = (t: Tab) => setSp(t === "overview" ? {} : { tab: t }, { replace: true });
  const { data: pr, isLoading } = useProject(id);
  const { data: statuses } = useProjectStatuses();
  const { data: profiles } = useProfiles();
  const [sheet, setSheet] = useState<"" | "project" | "customer">("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!pr) return <Empty title="Project not found" text="It may have been deleted, or it isn't assigned to you." action={<Link to="/projects"><Button variant="secondary">Back to projects</Button></Link>} />;

  const c = pr.customer;
  const status = statuses?.find((s) => s.id === pr.status_id);
  const locked = pr.locked;
  const refresh = () => ["project", "projects", "history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  async function patch(values: Record<string, unknown>, msg: string) {
    setSaving(true);
    const { error } = await supabase.from("projects").update(values).eq("id", pr!.id);
    setSaving(false);
    if (error) { toast(friendlyError(error), "error"); return false; }
    toast(msg); refresh(); return true;
  }
  async function changeStatus(sid: number) {
    const s = statuses?.find((x) => x.id === sid);
    if (s?.is_completed && !confirm("Mark this project as Completed? It will be locked, and only the owner can unlock it.")) return;
    await patch({ status_id: sid }, s?.is_completed ? "Project completed and locked" : `Moved to ${s?.name}`);
  }
  const place = [c.address, c.village, c.district, c.pincode].filter(Boolean).join(", ");
  const tabs: [Tab, string][] = [["overview", "Overview"], ...(p.assignLeads ? [["payments", "Payments"] as [Tab, string]] : []), ["checklist", "Checklist"], ["documents", "Documents"], ["subsidy", "Subsidy"], ...(p.deleteRecords ? [["history", "History"] as [Tab, string]] : [])];

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</button>

      {locked && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success-tint px-4 py-3">
          <Lock className="h-5 w-5 shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-sm text-ink"><b>Completed{pr.completed_on ? ` on ${fmtDate(pr.completed_on)}` : ""}.</b> Details are locked so nothing changes by mistake.{!p.deleteRecords && " Ask the owner if something needs correcting."}</p>
          {p.deleteRecords && <Button size="sm" variant="secondary" loading={saving} onClick={() => confirm("Unlock this project to make a correction? The unlock is recorded in the history.") && patch({ locked: false }, "Unlocked. Lock it again when you're done.")}><LockOpen className="h-4 w-4" />Unlock to correct</Button>}
        </div>
      )}
      {!locked && status?.is_completed && p.deleteRecords && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber/50 bg-amber/10 px-4 py-3">
          <LockOpen className="h-5 w-5 shrink-0 text-ink" />
          <p className="min-w-0 flex-1 text-sm text-ink">This completed project is <b>unlocked</b> for corrections.</p>
          <Button size="sm" variant="navy" loading={saving} onClick={() => patch({ locked: true }, "Locked again")}><Lock className="h-4 w-4" />Lock again</Button>
        </div>
      )}

      {/* Header */}
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar name={c.name} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold sm:text-2xl">{c.name}</h1>
            <p className="text-sm text-muted">{pr.project_no} · {c.customer_no} · started {fmtDate(pr.start_date ?? pr.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Action href={telLink(c.phone)} icon={<Phone className="h-5 w-5" />} label="Call" cls="bg-blue-tint text-blue" />
          <Action href={waLink(c.whatsapp || c.phone, `Namaste ${c.name.split(" ")[0]} ji, Topline Solar se.`)} icon={<MessageCircle className="h-5 w-5" />} label="WhatsApp" cls="bg-success-tint text-success" external />
          <Action href={place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place + ", Bihar")}` : undefined} icon={<MapPin className="h-5 w-5" />} label="Map" cls="bg-cloud text-navy" external />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-4 sm:grid-cols-3">
          <label className="col-span-2 block sm:col-span-1">
            <span className="label">Project status</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: status?.color }} />
              <select className="input pl-8 font-semibold disabled:bg-cloud" value={pr.status_id} disabled={locked || saving} onChange={(e) => changeStatus(Number(e.target.value))}>
                {statuses?.filter((s) => s.active || s.id === pr.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {!status?.is_completed && <span className="mt-1 block text-xs text-muted">{daysSince(pr.status_changed_at) === 0 ? "Changed today" : `In this status for ${daysSince(pr.status_changed_at)} days`}</span>}
          </label>
          <Kpi label="System" value={pr.capacity_kw ? `${pr.capacity_kw} kW ${pr.system_type}` : "Not set"} icon={<Zap className="h-4 w-4 text-amber" />} />
          <Kpi label="Project cost" value={rupees(pr.total_cost)} sub={pr.finance_type === "Bank loan" ? "Bank loan" : "Cash / own funds"} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-ink/5 p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("h-9 shrink-0 flex-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold sm:px-3 sm:text-sm", tab === k ? "bg-white text-ink shadow-sm" : "text-muted")}>{l}{k === "subsidy" && <span className="hidden sm:inline"> &amp; loan</span>}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3"><MilestoneTracker projectId={pr.id} locked={locked} /></div>
          <div className="space-y-4 lg:col-span-2">
            {pr.lead_id && <QuotesCard leadId={pr.lead_id} />}
            <InfoCard title="System details" onEdit={locked ? undefined : () => setSheet("project")}>
              <Row k="Size" v={pr.capacity_kw ? `${pr.capacity_kw} kW` : "—"} />
              <Row k="Type" v={pr.system_type} />
              <Row k="Panels" v={pr.panel_brand ? `${pr.panel_brand}${pr.panel_wattage ? ` ${pr.panel_wattage} W` : ""}${pr.panel_count ? ` × ${pr.panel_count}` : ""}` : "—"} />
              <Row k="Inverter" v={pr.inverter_brand ? `${pr.inverter_brand}${pr.inverter_capacity_kw ? ` ${pr.inverter_capacity_kw} kW` : ""}` : "—"} />
              <Row k="Inverter serial" v={pr.inverter_serial ?? "—"} />
              {pr.structure_type && <Row k="Structure" v={pr.structure_type} />}
              {pr.battery_details && <Row k="Battery" v={pr.battery_details} />}
              <Row k="Salesperson" v={profiles?.find((u) => u.id === pr.assigned_to)?.full_name ?? "—"} />
              <Row k="Installers" v={pr.installer_names ?? "—"} />
              <Row k="Installed on" v={fmtDate(pr.installed_on)} />
              {pr.notes && <Row k="Notes" v={pr.notes} />}
            </InfoCard>
            <InfoCard title="Customer" onEdit={locked ? undefined : () => setSheet("customer")}>
              <Row k="Mobile" v={fmtPhone(c.phone)} />
              {c.father_name && <Row k="Father / husband" v={c.father_name} />}
              <Row k="Address" v={place || "—"} />
              <Row k="Consumer (CA) no." v={c.consumer_no ?? "—"} />
              <Row k="DISCOM" v={c.discom ?? "—"} />
              {c.sanctioned_load_kw != null && <Row k="Sanctioned load" v={`${c.sanctioned_load_kw} kW${c.connection_phase ? `, ${c.connection_phase.toLowerCase()}` : ""}`} />}
              {c.co_applicant_name && <Row k="Co-applicant" v={`${c.co_applicant_name}${c.co_applicant_relation ? ` (${c.co_applicant_relation})` : ""}`} />}
              {pr.lead_id && <div className="pt-2"><Link to={`/leads/${pr.lead_id}`} className="text-sm font-semibold text-blue">Open original lead and survey →</Link></div>}
            </InfoCard>
          </div>
        </div>
      )}
      {tab === "payments" && p.assignLeads && <PaymentsPanel project={pr} customer={c} />}
      {tab === "checklist" && <ChecklistPanel projectId={pr.id} locked={locked} />}
      {tab === "documents" && <DocumentsPanel scope={{ projectId: pr.id }} financeType={pr.finance_type} locked={locked} zipName={`${pr.project_no} ${c.name}`} />}
      {tab === "subsidy" && <SubsidyLoanPanel project={pr} locked={locked} />}
      {tab === "history" && p.deleteRecords && <HistoryPanel projectId={pr.id} customerId={c.id} />}

      {p.deleteRecords && !locked && (
        <div className="mt-6 flex justify-end">
          <Button variant="danger" size="sm" onClick={async () => { if (confirm("Move this project to the trash? You can restore it from Trash.") && await patch({ deleted_at: new Date().toISOString() }, "Moved to trash")) nav("/projects"); }}>
            <Trash2 className="h-4 w-4" />Move to trash
          </Button>
        </div>
      )}

      <EditProjectSheet open={sheet === "project"} onClose={() => setSheet("")} project={pr} />
      <EditCustomerSheet open={sheet === "customer"} onClose={() => setSheet("")} customer={c} />
    </div>
  );
}

function Action({ href, icon, label, cls, external }: { href?: string; icon: ReactNode; label: string; cls: string; external?: boolean }) {
  return <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    className={cx("flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition active:scale-95", cls, !href && "pointer-events-none opacity-40")}>{icon}{label}</a>;
}
function Kpi({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: ReactNode }) {
  return <div><span className="label">{label}</span><p className="flex h-11 items-center gap-1.5 text-lg font-bold tabular-nums text-ink">{icon}{value}</p>{sub && <span className="block text-xs text-muted">{sub}</span>}</div>;
}
function InfoCard({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">{title}</h3>{onEdit && <button onClick={onEdit} className="flex items-center gap-1 text-sm font-semibold text-blue"><Pencil className="h-3.5 w-3.5" />Edit</button>}</div>
      <dl className="divide-y divide-rule/70 text-sm">{children}</dl>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 py-2"><dt className="shrink-0 text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>;
}

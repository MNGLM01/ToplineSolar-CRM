import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Search, Plus, SlidersHorizontal, Phone, MessageCircle, Users, CalendarClock, LayoutGrid, List, X } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { useLeads, PAGE, type LeadFilters } from "../lib/leads";
import { useProfiles, useSources, useStages } from "../lib/queries";
import { DISTRICTS, type Lead, type Stage } from "../lib/types";
import { fmtPhone, isOverdue, relTime, rupees, telLink, waLink } from "../lib/format";
import { moveStage } from "../lib/moveStage";
import { Avatar, Button, Empty, PageHeader, PageLoader, Segmented, StageBadge, TempBadge, cx, friendlyError, useToast } from "../components/ui";
import { LostReasonSheet } from "../components/LostReasonSheet";

export default function Leads() {
  const { profile } = useAuth();
  const p = can(profile?.role);
  const { openNewLead } = useOutletContext<{ openNewLead: () => void }>();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as "list" | "board") || "list";
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const { data: stages } = useStages();
  const { data: sources } = useSources();
  const { data: profiles } = useProfiles();

  const f: LeadFilters = {
    q: params.get("q") ?? "", stage: params.get("stage") ?? "", assigned: params.get("assigned") ?? "",
    source: params.get("source") ?? "", district: params.get("district") ?? "", temp: params.get("temp") ?? "",
    due: (params.get("due") as LeadFilters["due"]) ?? "",
  };
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); setPage(0);
  };
  const activeCount = ["stage", "assigned", "source", "district", "temp", "due"].filter((k) => params.get(k)).length;

  return (
    <div>
      <PageHeader title="Leads"
        subtitle={p.seeAllLeads ? "All leads" : "Leads assigned to you"}
        actions={<>
          <Segmented value={view} onChange={(v) => setParam("view", v === "list" ? "" : v)}
            options={[{ value: "list", label: <span className="flex items-center gap-1.5"><List className="h-4 w-4" />List</span> },
                      { value: "board", label: <span className="flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" />Board</span> }]} />
          <Button onClick={openNewLead} className="hidden sm:inline-flex"><Plus className="h-4 w-4" />New lead</Button>
        </>} />

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Search name, mobile, village or lead no." value={f.q}
            onChange={(e) => setParam("q", e.target.value)} />
        </div>
        <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} className="relative">
          <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange text-[11px] text-white">{activeCount}</span>}
        </Button>
      </div>

      {showFilters && (
        <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {view === "list" && <FilterSelect label="Stage" value={f.stage!} onChange={(v) => setParam("stage", v)} options={stages?.map((s) => ({ value: String(s.id), label: s.name })) ?? []} />}
          {p.seeAllLeads && <FilterSelect label="Assigned to" value={f.assigned!} onChange={(v) => setParam("assigned", v)}
            options={[{ value: "none", label: "Not assigned" }, ...(profiles?.filter((x) => x.role !== "partner").map((x) => ({ value: x.id, label: x.full_name })) ?? [])]} />}
          <FilterSelect label="Source" value={f.source!} onChange={(v) => setParam("source", v)} options={sources?.map((s) => ({ value: String(s.id), label: s.name })) ?? []} />
          <FilterSelect label="District" value={f.district!} onChange={(v) => setParam("district", v)} options={DISTRICTS.map((d) => ({ value: d, label: d }))} />
          <FilterSelect label="Interest" value={f.temp!} onChange={(v) => setParam("temp", v)} options={[{ value: "hot", label: "Hot" }, { value: "warm", label: "Warm" }, { value: "cold", label: "Cold" }]} />
          <FilterSelect label="Follow-up" value={f.due!} onChange={(v) => setParam("due", v)} options={[{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "none", label: "None scheduled" }]} />
          {activeCount > 0 && (
            <button className="flex items-center gap-1 text-sm font-semibold text-blue sm:col-span-3 lg:col-span-6" onClick={() => { const n = new URLSearchParams(); if (params.get("view")) n.set("view", params.get("view")!); if (f.q) n.set("q", f.q); setParams(n); }}>
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
      )}

      {view === "list"
        ? <LeadList f={f} page={page} setPage={setPage} stages={stages ?? []} openNewLead={openNewLead} />
        : <Board f={f} stages={stages ?? []} />}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input h-10 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function LeadList({ f, page, setPage, stages, openNewLead }: { f: LeadFilters; page: number; setPage: (n: number) => void; stages: Stage[]; openNewLead: () => void }) {
  const { data, isLoading } = useLeads(f, page);
  const { data: profiles } = useProfiles();
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const name = (id: string | null) => profiles?.find((x) => x.id === id)?.full_name;

  if (isLoading) return <PageLoader />;
  if (!data?.rows.length)
    return <div className="card"><Empty icon={<Users className="h-6 w-6" />} title="No leads found" text={f.q ? "Try a different search or clear the filters." : "Add your first lead to get started."} action={<Button onClick={openNewLead}><Plus className="h-4 w-4" />New lead</Button>} /></div>;

  const pages = Math.ceil(data.count / PAGE);
  return (
    <>
      {/* Phone: cards */}
      <div className="grid gap-2 md:hidden">
        {data.rows.map((l) => {
          const st = stageById.get(l.stage_id);
          return (
            <Link key={l.id} to={`/leads/${l.id}`} className="card flex items-start gap-3 p-3.5 active:bg-cloud">
              <Avatar name={l.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate font-semibold text-ink">{l.name}</p><TempBadge t={l.temperature} /></div>
                <p className="truncate text-sm text-muted">{[...new Set([l.village, l.district].filter(Boolean))].join(", ") || fmtPhone(l.phone)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {st && <StageBadge name={st.name} color={st.color} />}
                  {l.next_followup_at && <FollowChip at={l.next_followup_at} />}
                </div>
              </div>
              <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                <a href={telLink(l.phone)} onClick={(e) => e.stopPropagation()} aria-label="Call" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-tint text-blue"><Phone className="h-4 w-4" /></a>
                <a href={waLink(l.whatsapp || l.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-success-tint text-success"><MessageCircle className="h-4 w-4" /></a>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-rule bg-cloud/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Bill / month</th><th className="px-4 py-3">Follow-up</th><th className="px-4 py-3">Assigned</th></tr>
          </thead>
          <tbody>
            {data.rows.map((l) => {
              const st = stageById.get(l.stage_id);
              return (
                <tr key={l.id} className="border-b border-rule/60 last:border-0 hover:bg-cloud/50">
                  <td className="px-4 py-3">
                    <Link to={`/leads/${l.id}`} className="flex items-center gap-3">
                      <Avatar name={l.name} size={34} />
                      <span><span className="flex items-center gap-2 font-semibold text-ink">{l.name}<TempBadge t={l.temperature} /></span><span className="text-muted">{fmtPhone(l.phone)} · {l.lead_no}</span></span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body">{[...new Set([l.village, l.district].filter(Boolean))].join(", ") || "—"}</td>
                  <td className="px-4 py-3">{st && <StageBadge name={st.name} color={st.color} />}</td>
                  <td className="px-4 py-3 tabular-nums">{rupees(l.monthly_bill)}</td>
                  <td className="px-4 py-3">{l.next_followup_at ? <FollowChip at={l.next_followup_at} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-body">{name(l.assigned_to) ?? <span className="text-orange-dark">Not assigned</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>{data.count.toLocaleString("en-IN")} lead{data.count === 1 ? "" : "s"}</span>
        {pages > 1 && <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>{page + 1} / {pages}</span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>}
      </div>
    </>
  );
}

export function FollowChip({ at }: { at: string }) {
  const overdue = isOverdue(at);
  return <span className={cx("chip", overdue ? "bg-danger-tint text-danger" : "bg-blue-tint text-blue")}><CalendarClock className="h-3 w-3" />{overdue ? "Overdue · " : ""}{relTime(at)}</span>;
}

// ---------------- Kanban board ----------------
function Board({ f, stages }: { f: LeadFilters; stages: Stage[] }) {
  const { data, isLoading } = useLeads({ ...f, stage: "" }, 0, undefined, 500);
  const qc = useQueryClient();
  const toast = useToast();
  const [lostFor, setLostFor] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  const cols = stages.filter((s) => s.active);

  async function move(id: string, stageId: number, lost?: { reasonId: number; note: string }) {
    // optimistic update
    qc.setQueriesData<{ rows: Lead[]; count: number }>({ queryKey: ["leads"] }, (old) => old && { ...old, rows: old.rows.map((r) => r.id === id ? { ...r, stage_id: stageId } : r) });
    try { await moveStage(id, stageId, lost); toast(`Moved to ${stages.find((s) => s.id === stageId)?.name}`); }
    catch (e) { toast(friendlyError(e), "error"); }
    qc.invalidateQueries({ queryKey: ["leads"] });
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const id = String(e.active.id); const stageId = Number(e.over.id);
    const lead = data?.rows.find((r) => r.id === id);
    if (!lead || lead.stage_id === stageId) return;
    if (stages.find((s) => s.id === stageId)?.is_lost) { setLostFor(`${id}|${stageId}`); return; }
    move(id, stageId);
  }

  if (isLoading) return <PageLoader />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">Drag a lead to another column to change its stage.</p>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {cols.map((s) => <Column key={s.id} stage={s} leads={data?.rows.filter((r) => r.stage_id === s.id) ?? []} />)}
        </div>
      </DndContext>
      <LostReasonSheet open={!!lostFor} onClose={() => setLostFor(null)}
        onConfirm={(reasonId, note) => { const [id, st] = lostFor!.split("|"); setLostFor(null); move(id, Number(st), { reasonId, note }); }} />
    </>
  );
}

function Column({ stage, leads }: { stage: Stage; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={cx("flex w-72 shrink-0 flex-col rounded-2xl bg-ink/[.04] p-2 transition", isOver && "bg-orange-tint ring-2 ring-orange/40")}>
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
        <span className="text-sm font-semibold text-ink">{stage.name}</span>
        <span className="ml-auto rounded-full bg-white px-2 text-xs font-semibold text-muted">{leads.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {leads.map((l) => <BoardCard key={l.id} lead={l} />)}
      </div>
    </div>
  );
}

function BoardCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={cx("card cursor-grab touch-manipulation p-3 active:cursor-grabbing", isDragging && "z-50 rotate-1 shadow-pop")}>
      <Link to={`/leads/${lead.id}`} className="block" onClick={(e) => isDragging && e.preventDefault()}>
        <div className="flex items-center justify-between gap-2"><p className="truncate font-semibold text-ink">{lead.name}</p><TempBadge t={lead.temperature} /></div>
        <p className="truncate text-sm text-muted">{[...new Set([lead.village, lead.district].filter(Boolean))].join(", ") || fmtPhone(lead.phone)}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-xs tabular-nums text-body">{lead.monthly_bill ? `${rupees(lead.monthly_bill)}/mo` : ""}</span>
          {lead.next_followup_at && <FollowChip at={lead.next_followup_at} />}
        </div>
      </Link>
    </div>
  );
}

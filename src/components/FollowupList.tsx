import { useState } from "react";
import { Link } from "react-router-dom";
import { Phone, MessageCircle, CheckCircle2, CalendarClock } from "lucide-react";
import type { FollowupRow } from "../lib/followups";
import { fmtDateTime, isOverdue, relTime, telLink, waLink } from "../lib/format";
import { useProfiles } from "../lib/queries";
import type { Followup } from "../lib/types";
import { Empty, cx } from "./ui";
import { CompleteFollowupSheet } from "./CompleteFollowupSheet";
import { FollowupSheet } from "./FollowupSheet";

export function FollowupList({ rows, showOwner, emptyText, done }: { rows: FollowupRow[]; showOwner?: boolean; emptyText: string; done?: boolean }) {
  const [completing, setCompleting] = useState<Followup | null>(null);
  const [nextFor, setNextFor] = useState<FollowupRow | null>(null);
  const { data: profiles } = useProfiles();
  if (!rows.length) return <Empty icon={<CalendarClock className="h-6 w-6" />} title="Nothing here" text={emptyText} />;
  return (
    <>
      <ul className="divide-y divide-rule/70">
        {rows.map((f) => {
          const overdue = !done && isOverdue(f.due_at);
          return (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <span className={cx("h-10 w-1 shrink-0 rounded-full", done ? "bg-success" : overdue ? "bg-danger" : "bg-blue")} />
              <Link to={`/leads/${f.lead_id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{f.leads?.name}<span className="font-normal text-muted"> · {f.title.split(" · ")[0]}</span></p>
                <p className={cx("truncate text-sm", overdue ? "text-danger" : "text-muted")}>
                  {done ? `Done ${fmtDateTime(f.completed_at)}${f.outcome ? ` · ${f.outcome}` : ""}` : `${overdue ? "Overdue · " : ""}${relTime(f.due_at)}${f.note ? ` · ${f.note}` : ""}`}
                  {showOwner && ` · ${profiles?.find((x) => x.id === f.owner_id)?.full_name ?? ""}`}
                </p>
              </Link>
              {!done && f.leads && <>
                <a href={telLink(f.leads.phone)} aria-label="Call" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-tint text-blue"><Phone className="h-4 w-4" /></a>
                <a href={waLink(f.leads.whatsapp || f.leads.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-tint text-success sm:flex"><MessageCircle className="h-4 w-4" /></a>
                <button onClick={() => setCompleting(f)} aria-label="Mark done" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule text-muted hover:border-success hover:text-success"><CheckCircle2 className="h-5 w-5" /></button>
              </>}
            </li>
          );
        })}
      </ul>
      <CompleteFollowupSheet f={completing} onClose={() => setCompleting(null)} onScheduleNext={(f) => setNextFor(f as FollowupRow)} />
      {nextFor && <FollowupSheet open onClose={() => setNextFor(null)} leadId={nextFor.lead_id} leadName={nextFor.leads?.name ?? ""} title="Schedule next follow-up" />}
    </>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useLead } from "../lib/leads";
import { useEstimateSettings } from "../lib/queries";
import { estimateFromBill } from "../lib/estimate";
import { createQuotation, quoteLabel, STATUS_STYLE, useCompany, usePriceItems, useQuotesForLead } from "../lib/quotes";
import { fmtDate, rupees } from "../lib/format";
import { Button, cx, friendlyError, useToast } from "./ui";

/** Quotations for a lead (shown on the lead and on its project). Only the latest version of each is listed. */
export function QuotesCard({ leadId, suggestedKw, projectId }: { leadId: string; suggestedKw?: number | null; projectId?: string | null }) {
  const { data: quotes } = useQuotesForLead(leadId);
  const { data: lead } = useLead(leadId);
  const { data: priceItems } = usePriceItems();
  const { data: company } = useCompany();
  const { data: est } = useEstimateSettings();
  const [busy, setBusy] = useState(false);
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();

  const latest = Object.values((quotes ?? []).reduce<Record<string, NonNullable<typeof quotes>[number]>>((m, q) => {
    if (!m[q.quote_no] || m[q.quote_no].version < q.version) m[q.quote_no] = q; return m;
  }, {}));

  async function create() {
    if (!lead || !priceItems || !company || !est) return;
    const kw = suggestedKw || (lead.monthly_bill ? estimateFromBill(lead.monthly_bill, est, lead.customer_type).kw : 3);
    setBusy(true);
    try {
      const id = await createQuotation({ lead, kw, priceItems, company, est, projectId });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      nav(`/quotes/${id}`);
    } catch (e) { toast(friendlyError(e), "error"); setBusy(false); }
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">Quotations</h3>
        {lead && <button onClick={create} disabled={busy} className="flex items-center gap-1 text-sm font-semibold text-blue disabled:opacity-50"><Plus className="h-4 w-4" />New</button>}
      </div>
      {!latest.length ? (
        <div className="py-1">
          <p className="mb-3 text-sm text-muted">Make a priced quotation with GST, subsidy and EMI, and send it as a PDF on WhatsApp.</p>
          {lead && <Button variant="secondary" className="w-full" loading={busy} onClick={create}><FileText className="h-4 w-4" />Make quotation</Button>}
        </div>
      ) : (
        <ul className="-mx-1 divide-y divide-rule/70">
          {latest.map((q) => (
            <li key={q.id}>
              <Link to={`/quotes/${q.id}`} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-cloud">
                <FileText className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{quoteLabel(q)} · {q.capacity_kw} kW</span>
                  <span className="block text-xs text-muted">{fmtDate(q.updated_at)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular-nums text-ink">{rupees(q.total)}</span>
                  <span className={cx("chip mt-0.5", STATUS_STYLE[q.status])}>{q.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

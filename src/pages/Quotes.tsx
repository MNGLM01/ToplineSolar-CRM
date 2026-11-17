import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { STATUS_STYLE, quoteLabel, type Quotation } from "../lib/quotes";
import { fmtDate, rupees } from "../lib/format";
import { Empty, PageHeader, PageLoader, Segmented, cx } from "../components/ui";

const FILTERS = [{ value: "", label: "All" }, { value: "Draft", label: "Draft" }, { value: "Sent", label: "Sent" }, { value: "Accepted", label: "Accepted" }, { value: "Rejected", label: "Not accepted" }];

export default function Quotes() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["quotes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotations").select("id, quote_no, version, status, customer_name, customer_address, capacity_kw, system_type, total, subsidy, updated_at, lead_id")
        .is("deleted_at", null).order("updated_at", { ascending: false }).limit(1000);
      if (error) throw error; return data as Quotation[];
    },
  });
  // latest version of each quotation only
  const latest = Object.values((data ?? []).reduce<Record<string, Quotation>>((m, x) => { if (!m[x.quote_no] || m[x.quote_no].version < x.version) m[x.quote_no] = x; return m; }, {}))
    .filter((x) => (!status || x.status === status) && (!q || `${x.customer_name} ${x.quote_no} ${x.customer_address ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <div>
      <PageHeader title="Quotations" subtitle="Start a quotation from a lead's page" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name, village or TQ number" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto"><Segmented value={status} onChange={setStatus} options={FILTERS} /></div>
      </div>
      <div className="card">
        {isLoading ? <PageLoader /> : !latest.length ? (
          <Empty icon={<FileText className="h-6 w-6" />} title={data?.length ? "No matching quotations" : "No quotations yet"} text="Open a lead and tap “Make quotation”." />
        ) : (
          <ul className="divide-y divide-rule/70">
            {latest.map((x) => (
              <li key={x.id}>
                <Link to={`/quotes/${x.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cloud">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{x.customer_name}</span>
                    <span className="block truncate text-xs text-muted">{quoteLabel(x)} · {x.capacity_kw} kW {x.system_type}{x.customer_address ? ` · ${x.customer_address}` : ""} · {fmtDate(x.updated_at)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold tabular-nums text-ink">{rupees(x.total)}</span>
                    <span className={cx("chip mt-0.5", STATUS_STYLE[x.status])}>{x.status === "Rejected" ? "Not accepted" : x.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

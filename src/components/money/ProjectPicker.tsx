import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cx } from "../ui";

export interface PickedProject { id: string; project_no: string; customer_name: string; village?: string | null }

/** Type a customer name, mobile or project number to pick a project. */
export function ProjectPicker({ value, onChange, error, placeholder = "Search customer, mobile or project no." }:
  { value: PickedProject | null; onChange: (p: PickedProject | null) => void; error?: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["project-picker", debounced], enabled: open,
    queryFn: async () => {
      const s = debounced.replace(/[,()%]/g, " ");
      let query = supabase.from("projects").select("id, project_no, customer:customers!inner(name, phone, village)").is("deleted_at", null);
      if (s) {
        const digits = s.replace(/\D/g, "");
        query = /^tp/i.test(s) ? query.ilike("project_no", `%${s}%`)
          : digits.length >= 4 ? query.ilike("customer.phone", `%${digits}%`)
          : query.ilike("customer.name", `%${s}%`);
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return (data as unknown as { id: string; project_no: string; customer: { name: string; phone: string; village: string | null } }[])
        .map((r) => ({ id: r.id, project_no: r.project_no, customer_name: r.customer.name, village: r.customer.village }));
    },
  });

  if (value) return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-rule bg-cloud px-3">
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{value.customer_name} <span className="text-muted">· {value.project_no}</span></span>
      <button type="button" onClick={() => onChange(null)} aria-label="Change project" className="rounded-lg p-1 text-muted hover:bg-white"><X className="h-4 w-4" /></button>
    </div>
  );
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input className={cx("input pl-9", error && "border-danger")} placeholder={placeholder} value={q}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
      {open && (
        <ul className="absolute inset-x-0 top-12 z-10 max-h-64 overflow-y-auto rounded-xl border border-rule bg-white py-1 shadow-pop">
          {!data?.length && <li className="px-3 py-2.5 text-sm text-muted">{isFetching ? "Searching…" : "No matching project"}</li>}
          {data?.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p); setQ(""); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-cloud">
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{p.customer_name}{p.village ? <span className="text-muted">, {p.village}</span> : null}</span>
                <span className="shrink-0 text-xs text-muted">{p.project_no}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

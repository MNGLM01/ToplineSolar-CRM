import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import readXlsxFile from "read-excel-file";
import Papa from "papaparse";
import { FileSpreadsheet, Upload, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { normaliseMobile } from "../lib/format";
import { assignable, useProfiles, useSources, useStages } from "../lib/queries";
import { Button, Field, PageHeader, cx, friendlyError, useToast } from "../components/ui";

const TARGETS = [
  { key: "name", label: "Name *", guess: ["name", "customer", "naam", "customer name", "full name"] },
  { key: "phone", label: "Mobile *", guess: ["mobile", "phone", "contact", "number", "mob", "phone number", "mobile no"] },
  { key: "village", label: "Village / town", guess: ["village", "town", "city", "gaon", "location", "place"] },
  { key: "district", label: "District", guess: ["district", "zila", "dist"] },
  { key: "address", label: "Address", guess: ["address", "pata"] },
  { key: "pincode", label: "Pincode", guess: ["pincode", "pin", "pin code"] },
  { key: "monthly_bill", label: "Monthly bill (₹)", guess: ["bill", "monthly bill", "electricity bill", "avg bill"] },
  { key: "stage", label: "Stage / status", guess: ["stage", "status"] },
  { key: "source", label: "Source", guess: ["source", "lead source"] },
  { key: "notes", label: "Notes / remarks", guess: ["notes", "remarks", "remark", "comment", "comments"] },
] as const;
type Key = (typeof TARGETS)[number]["key"];

export default function Import() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<Partial<Record<Key, number>>>({});
  const [assignTo, setAssignTo] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [existing, setExisting] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const { data: profiles } = useProfiles();
  const { data: sources } = useSources();
  const { data: stages } = useStages();
  const qc = useQueryClient(); const toast = useToast();

  async function onFile(file: File) {
    setResult(null); setExisting(null); setFileName(file.name);
    let table: string[][] = [];
    try {
      if (/\.csv$/i.test(file.name)) table = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true }).data;
      else table = (await readXlsxFile(file)).map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
    } catch { toast("Couldn't read that file. Save it as .xlsx or .csv and try again.", "error"); return; }
    const hi = table.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2); // first real header row
    const h = (table[hi] ?? []).map((c) => String(c).trim());
    const body = table.slice(hi + 1).filter((r) => r.some((c) => String(c).trim()));
    const m: Partial<Record<Key, number>> = {};
    TARGETS.forEach((t) => { const i = h.findIndex((x) => (t.guess as readonly string[]).includes(x.toLowerCase())); if (i >= 0) m[t.key] = i; });
    if (m.name == null) { const i = h.findIndex((x) => /name|naam/i.test(x)); if (i >= 0) m.name = i; }
    if (m.phone == null) { const i = h.findIndex((x) => /mob|phone|contact/i.test(x)); if (i >= 0) m.phone = i; }
    setHeaders(h); setRows(body); setMap(m);
    // look up which numbers already exist
    const phones = body.map((r) => normaliseMobile(m.phone != null ? r[m.phone] : null)).filter(Boolean) as string[];
    const found = new Set<string>();
    for (let i = 0; i < phones.length; i += 200) {
      const { data } = await supabase.from("leads").select("phone").in("phone", phones.slice(i, i + 200)).is("deleted_at", null);
      data?.forEach((d: { phone: string }) => found.add(d.phone));
    }
    setExisting(found);
  }

  const parsed = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((r) => {
      const get = (k: Key) => (map[k] != null ? String(r[map[k]!] ?? "").trim() : "");
      const phone = normaliseMobile(get("phone"));
      let problem = "";
      if (!get("name")) problem = "No name";
      else if (!phone) problem = "Invalid mobile";
      else if (seen.has(phone)) problem = "Repeated in file";
      else if (existing?.has(phone)) problem = "Already in CRM";
      if (phone) seen.add(phone);
      const stageName = get("stage").toLowerCase();
      const stage = stages?.find((s) => s.name.toLowerCase() === stageName);
      const srcName = get("source").toLowerCase();
      const src = sources?.find((s) => s.name.toLowerCase() === srcName);
      const bill = Number(get("monthly_bill").replace(/[^\d.]/g, ""));
      const pin = get("pincode").replace(/\D/g, "");
      return {
        problem,
        row: {
          name: get("name"), phone, village: get("village") || null, district: get("district") || null, address: get("address") || null,
          pincode: /^[1-9]\d{5}$/.test(pin) ? pin : null, monthly_bill: bill > 0 ? bill : null,
          stage_id: stage?.id ?? 1, source_id: src?.id ?? (defaultSource ? Number(defaultSource) : null),
          assigned_to: assignTo || null,
          notes: [get("notes"), stageName && !stage ? `Status in Excel: ${get("stage")}` : ""].filter(Boolean).join("\n") || null,
        },
      };
    });
  }, [rows, map, existing, stages, sources, defaultSource, assignTo]);
  const good = parsed.filter((p) => !p.problem);

  async function run() {
    setBusy(true);
    let added = 0;
    try {
      for (let i = 0; i < good.length; i += 100) {
        const { error } = await supabase.from("leads").insert(good.slice(i, i + 100).map((g) => g.row));
        if (error) throw error;
        added += Math.min(100, good.length - i);
      }
      setResult({ added, skipped: parsed.length - added });
      qc.invalidateQueries({ queryKey: ["leads"] });
      setRows([]); setHeaders([]);
    } catch (e) { toast(`${friendlyError(e)} (${added} imported before the error)`, "error"); }
    setBusy(false);
  }

  return (
    <div>
      <PageHeader title="Import from Excel" subtitle="Bring your existing leads in. Duplicates and bad numbers are skipped automatically." />
      {result && (
        <div className="card mb-4 flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 text-success" />
          <p className="text-ink"><b>{result.added}</b> leads imported{result.skipped ? `, ${result.skipped} skipped` : ""}.</p>
        </div>
      )}
      {!rows.length ? (
        <label className="card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-rule px-6 py-14 text-center hover:border-orange">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-tint text-orange"><Upload className="h-6 w-6" /></span>
          <span className="font-semibold text-ink">Choose an Excel (.xlsx) or CSV file</span>
          <span className="max-w-sm text-sm text-muted">The first row should be column headings like Name, Mobile, Village, Bill. You'll match them on the next screen.</span>
          <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      ) : (
        <div className="grid gap-4">
          <div className="card p-4">
            <div className="mb-4 flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-success" /><p className="font-semibold text-ink">{fileName}</p><span className="text-sm text-muted">· {rows.length} rows</span></div>
            <h3 className="mb-2 font-bold">Match your columns</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TARGETS.map((t) => (
                <Field key={t.key} label={t.label}>
                  <select className={cx("input h-10 text-sm", map[t.key] == null && t.label.includes("*") && "border-danger")} value={map[t.key] ?? ""} onChange={(e) => setMap({ ...map, [t.key]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                    <option value="">Not in file</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Assign all imported leads to"><select className="input" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}><option value="">Nobody (assign later)</option>{assignable(profiles).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
              <Field label="Source when not in the file"><select className="input" value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}><option value="">None</option>{sources?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <p className="text-sm"><b className="text-success">{good.length} ready</b>{parsed.length - good.length > 0 && <span className="text-muted"> · {parsed.length - good.length} will be skipped</span>}</p>
              <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setRows([])}>Cancel</Button><Button size="sm" loading={busy || !existing} disabled={!good.length} onClick={run}>Import {good.length} leads</Button></div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-cloud text-left text-xs uppercase text-muted"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Mobile</th><th className="px-3 py-2">Village</th><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody>
                  {parsed.slice(0, 300).map((p, i) => (
                    <tr key={i} className="border-t border-rule/60">
                      <td className="px-3 py-2 text-ink">{p.row.name || "—"}</td><td className="px-3 py-2 tabular-nums">{p.row.phone ?? String(rows[i][map.phone ?? -1] ?? "")}</td>
                      <td className="px-3 py-2">{p.row.village}</td><td className="px-3 py-2">{p.row.monthly_bill ?? ""}</td>
                      <td className="px-3 py-2">{p.problem ? <span className="chip bg-danger-tint text-danger">{p.problem}</span> : <span className="chip bg-success-tint text-success">Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 300 && <p className="px-3 py-2 text-xs text-muted">Showing the first 300 rows. All {parsed.length} will be checked.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

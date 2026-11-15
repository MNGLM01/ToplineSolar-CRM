/* Branded PDFs: quotation proposal and customer payment statement. Loaded only when someone makes a PDF. */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { emi, lineAmount, quoteLabel, quoteTotals, savings, type Company, type Quotation } from "./quotes";
import type { EstimateSettings } from "./types";

Font.register({
  family: "Inter",
  fonts: [
    { src: "/pdf/Inter-Regular.ttf", fontWeight: 400 },
    { src: "/pdf/Inter-SemiBold.ttf", fontWeight: 600 },
    { src: "/pdf/Inter-Bold.ttf", fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const C = { navy: "#0A1F3C", navy2: "#13294B", orange: "#F58220", amber: "#FFB81C", blue: "#2D6CDF", ink: "#0A1F3C", body: "#3A4A63", muted: "#6B7A90", rule: "#DDE3EC", cloud: "#F4F6FA", green: "#1F9D55", greenTint: "#E8F6EE", orangeTint: "#FFF4EA" };
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number | null | undefined) => (n == null ? "—" : `₹${inr.format(Math.round(n))}`);
const rs2 = (n: number) => `₹${inr2.format(n)}`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const d = (s: string | null | undefined) => (s ? dateFmt.format(new Date(s)) : "—");

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: C.body, paddingTop: 72, paddingBottom: 56, paddingHorizontal: 40, lineHeight: 1.45 },
  header: { position: "absolute", top: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.rule, paddingBottom: 10 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  h2: { fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8, marginTop: 4 },
  section: { marginBottom: 18 },
  row: { flexDirection: "row" },
  th: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  cell: { paddingVertical: 5, paddingHorizontal: 4 },
  strong: { fontWeight: 700, color: C.ink },
  box: { backgroundColor: C.cloud, borderRadius: 6, padding: 12 },
});

function Header({ right }: { right: string }) {
  return (
    <View style={s.header} fixed>
      <Image src="/pdf/logo-horizontal.png" style={{ width: 120, height: 34.7 }} />
      <Text style={{ fontSize: 8, color: C.muted }}>{right}</Text>
    </View>
  );
}
function Footer({ co }: { co: Company }) {
  return (
    <View style={s.footer} fixed>
      <Text>{[co.name, co.address, co.phones].filter(Boolean).join("  ·  ")}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}
function KV({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.rule }]}>
      <Text style={{ color: C.muted }}>{k}</Text>
      <Text style={bold ? s.strong : { color: C.ink, fontWeight: 600 }}>{v}</Text>
    </View>
  );
}
function Bullets({ text }: { text: string }) {
  return <View>{text.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => (
    <View key={i} style={[s.row, { marginBottom: 3 }]}><Text style={{ width: 10, color: C.orange }}>•</Text><Text style={{ flex: 1 }}>{l}</Text></View>
  ))}</View>;
}
function Section({ title, children, wrap = false }: { title: string; children: ReactNode; wrap?: boolean }) {
  return <View style={s.section} wrap={wrap}><Text style={s.h2}>{title}</Text>{children}</View>;
}

// ---------------------------------------------------------------- Proposal
export interface ProposalInput { q: Quotation; co: Company; est: EstimateSettings; requiredDocs: string[]; preparedBy?: string | null }

function Proposal({ q, co, est, requiredDocs, preparedBy }: ProposalInput) {
  const t = quoteTotals(q.items, q.extra_discount);
  const net = Math.max(t.total - (q.subsidy || 0), 0);
  const sv = savings(q.capacity_kw, net, est, q.monthly_bill);
  const loanEmi = q.include_loan && q.loan_amount ? emi(q.loan_amount, q.loan_rate ?? 0, q.loan_months ?? 0) : 0;
  const panel = q.items.find((i) => i.category === "Panel");
  const inverter = q.items.find((i) => i.category === "Inverter");
  const label = `Proposal ${quoteLabel(q)}`;
  const kpis: [string, string, boolean?][] = [
    ["System size", `${num(q.capacity_kw)} kW`],
    ["Total price (incl. GST)", rs(t.total)],
    ...(q.subsidy > 0 ? [["PM Surya Ghar subsidy", `− ${rs(q.subsidy)}`] as [string, string], ["Your effective cost", rs(net), true] as [string, string, boolean]] : []),
  ];

  return (
    <Document title={`${co.name} ${label} · ${q.customer_name}`} author={co.name} subject="Rooftop solar proposal">
      {/* Cover */}
      <Page size="A4" style={{ fontFamily: "Inter", fontSize: 10, color: C.body }}>
        <View style={{ backgroundColor: C.navy, paddingHorizontal: 44, paddingTop: 44, paddingBottom: 40 }}>
          <Image src="/pdf/logo-horizontal-dark.png" style={{ width: 170, height: 49 }} />
          <View style={{ width: 48, height: 3, backgroundColor: C.amber, marginTop: 56, marginBottom: 16 }} />
          <Text style={{ fontSize: 30, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.15 }}>Rooftop Solar Proposal</Text>
          <Text style={{ fontSize: 13, color: "#FFFFFFB3", marginTop: 8 }}>{num(q.capacity_kw)} kW {q.system_type} solar power system</Text>
          <Text style={{ fontSize: 10, color: C.amber, marginTop: 28 }}>{co.tagline}</Text>
        </View>
        <View style={{ paddingHorizontal: 44, paddingTop: 30 }}>
          <View style={[s.row, { gap: 24 }]}>
            <View style={{ flex: 1.3 }}>
              <Text style={s.th}>Prepared for</Text>
              <Text style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>{q.customer_name}</Text>
              {q.customer_address ? <Text style={{ marginTop: 2 }}>{q.customer_address}</Text> : null}
              {q.customer_phone ? <Text style={{ marginTop: 2 }}>Mobile: {q.customer_phone}</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.th}>Proposal</Text>
              <Text style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginTop: 4 }}>{quoteLabel(q)}</Text>
              <Text style={{ marginTop: 2 }}>Date: {d(q.sent_at ?? q.updated_at)}</Text>
              {q.valid_until ? <Text style={{ marginTop: 2 }}>Valid until: {d(q.valid_until)}</Text> : null}
            </View>
          </View>

          <View style={[s.row, { marginTop: 30, gap: 8 }]}>
            {kpis.map(([k, v, hi]) => (
              <View key={k} style={{ flex: 1, borderRadius: 8, padding: 12, backgroundColor: hi ? C.orange : C.cloud }}>
                <Text style={{ fontSize: 8, color: hi ? "#FFFFFFD9" : C.muted }}>{k}</Text>
                <Text style={{ fontSize: 17, fontWeight: 700, color: hi ? "#FFFFFF" : C.ink, marginTop: 4 }}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={[s.row, { marginTop: 8, gap: 8 }]}>
            {[["Monthly saving", `~ ${rs(sv.monthly)}`], ["Pays for itself in", `~ ${sv.payback.toFixed(1)} years`], ["Savings over 25 years", `~ ${rs(sv.life25)}`]].map(([k, v]) => (
              <View key={k} style={{ flex: 1, borderRadius: 8, padding: 12, backgroundColor: C.greenTint }}>
                <Text style={{ fontSize: 8, color: C.green }}>{k}</Text>
                <Text style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 4 }}>{v}</Text>
              </View>
            ))}
          </View>
          {loanEmi > 0 && (
            <View style={{ marginTop: 8, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.rule, flexDirection: "row", justifyContent: "space-between" }}>
              <Text>Bank loan option: {rs(q.loan_amount)} at {num(q.loan_rate ?? 0)}% for {q.loan_months} months</Text>
              <Text style={s.strong}>EMI ~ {rs(loanEmi)} / month</Text>
            </View>
          )}
        </View>
        <View style={{ position: "absolute", bottom: 32, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 10, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: C.muted }}>
          <Text>{co.name} · {co.address}</Text>
          <Text>{[co.phones, co.email].filter(Boolean).join(" · ")}</Text>
        </View>
      </Page>

      {/* Details */}
      <Page size="A4" style={s.page} wrap>
        <Header right={`${label} · ${q.customer_name}`} />
        <Footer co={co} />

        <Section title="Your solar system">
          <View style={[s.row, { gap: 16 }]}>
            <View style={{ flex: 1 }}>
              <KV k="System size" v={`${num(q.capacity_kw)} kW`} />
              <KV k="System type" v={q.system_type} />
              {panel && <KV k="Solar panels" v={`${num(panel.qty)} × ${panel.name}`} />}
              {inverter && <KV k="Inverter" v={inverter.name} />}
              <KV k="Customer type" v={q.customer_type} />
            </View>
            <View style={{ flex: 1 }}>
              <KV k="Expected generation" v={`~ ${inr.format(sv.monthlyUnits)} units / month`} />
              <KV k="Per year" v={`~ ${inr.format(sv.annualUnits)} units`} />
              {q.monthly_bill ? <KV k="Your current bill" v={`${rs(q.monthly_bill)} / month`} /> : null}
              <KV k="Saving per year" v={`~ ${rs(sv.annual)}`} />
              <KV k="Payback" v={`~ ${sv.payback.toFixed(1)} years`} bold />
            </View>
          </View>
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 6 }}>
            Estimates use {num(est.units_per_kw_month)} units per kW per month and ₹{num(est.tariff_per_unit)} per unit. Actual generation depends on sunlight, shading and panel cleaning.
          </Text>
        </Section>

        <Section title="Price details" wrap>
          <View style={[s.row, { backgroundColor: C.navy, borderRadius: 4 }]}>
            {[["#", 18], ["Item", 0], ["Qty", 46], ["Rate", 62], ["Disc.", 34], ["GST", 34], ["Amount", 72]].map(([h, w]) => (
              <Text key={h} style={[s.cell, s.th, { color: "#FFFFFF", ...(w ? { width: w as number } : { flex: 1 }), textAlign: h === "Item" || h === "#" ? "left" : "right" }]}>{h}</Text>
            ))}
          </View>
          {q.items.map((it, i) => (
            <View key={i} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.rule }]} wrap={false}>
              <Text style={[s.cell, { width: 18, color: C.muted }]}>{i + 1}</Text>
              <View style={[s.cell, { flex: 1 }]}>
                <Text style={{ color: C.ink, fontWeight: 600 }}>{it.name}</Text>
                {it.description ? <Text style={{ fontSize: 7.5, color: C.muted }}>{it.description}</Text> : null}
              </View>
              <Text style={[s.cell, { width: 46, textAlign: "right" }]}>{num(it.qty)} {it.unit}</Text>
              <Text style={[s.cell, { width: 62, textAlign: "right" }]}>{rs(it.rate)}</Text>
              <Text style={[s.cell, { width: 34, textAlign: "right" }]}>{it.discount_pct ? `${num(it.discount_pct)}%` : "—"}</Text>
              <Text style={[s.cell, { width: 34, textAlign: "right" }]}>{num(it.gst_rate)}%</Text>
              <Text style={[s.cell, { width: 72, textAlign: "right", color: C.ink }]}>{rs2(lineAmount(it))}</Text>
            </View>
          ))}
          <View style={[s.row, { marginTop: 10 }]} wrap={false}>
            <View style={{ flex: 1, paddingRight: 20 }}>
              <Text style={[s.th, { marginBottom: 4 }]}>GST summary</Text>
              {Object.entries(t.byRate).filter(([, v]) => v.taxable > 0).map(([rate, v]) => (
                <Text key={rate} style={{ fontSize: 8, color: C.muted }}>{rate}% on {rs2(v.taxable)} = {rs2(v.gst)}</Text>
              ))}
            </View>
            <View style={{ width: 230 }}>
              {t.extra > 0 && <KV k="Items total" v={rs2(t.gross)} />}
              {t.extra > 0 && <KV k="Special discount" v={`− ${rs2(t.extra)}`} />}
              <KV k="Taxable amount" v={rs2(t.subtotal)} />
              <KV k="GST" v={rs2(t.gstAmount)} />
              <View style={[s.row, { justifyContent: "space-between", backgroundColor: C.navy, borderRadius: 4, padding: 7, marginTop: 4 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: 600 }}>Total payable to {co.name}</Text>
                <Text style={{ color: "#FFFFFF", fontWeight: 700 }}>{rs2(t.total)}</Text>
              </View>
              {q.subsidy > 0 && (
                <View style={{ marginTop: 6 }}>
                  <KV k="PM Surya Ghar subsidy (to your bank)" v={`− ${rs(q.subsidy)}`} />
                  <View style={[s.row, { justifyContent: "space-between", backgroundColor: C.orangeTint, borderRadius: 4, padding: 7, marginTop: 4 }]}>
                    <Text style={{ color: C.ink, fontWeight: 600 }}>Your effective cost</Text>
                    <Text style={{ color: C.ink, fontWeight: 700 }}>{rs(net)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Section>

        {loanEmi > 0 && (
          <Section title="Bank loan option">
            <View style={s.box}>
              <KV k="Loan amount" v={rs(q.loan_amount)} />
              <KV k="Interest rate" v={`${num(q.loan_rate ?? 0)}% per year`} />
              <KV k="Tenure" v={`${q.loan_months} months`} />
              <KV k="Monthly EMI (approx.)" v={rs(loanEmi)} bold />
              <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 6 }}>Loan approval, rate and tenure are decided by the bank. We help with the paperwork.</Text>
            </View>
          </Section>
        )}

        <View style={[s.row, { gap: 20 }]} wrap={false}>
          {q.payment_terms ? <View style={{ flex: 1 }}><Section title="Payment terms"><Bullets text={q.payment_terms} /></Section></View> : null}
          {requiredDocs.length > 0 && (
            <View style={{ flex: 1 }}>
              <Section title="Documents needed">
                <Bullets text={requiredDocs.join("\n")} />
              </Section>
            </View>
          )}
        </View>

        {(co.bank_account_no || co.upi_id) && (
          <Section title="Bank details for payment">
            <View style={[s.box, { flexDirection: "row", gap: 20 }]}>
              <View style={{ flex: 1 }}>
                {co.bank_account_name ? <KV k="Account name" v={co.bank_account_name} /> : null}
                {co.bank_name ? <KV k="Bank" v={co.bank_name} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                {co.bank_account_no ? <KV k="Account number" v={co.bank_account_no} /> : null}
                {co.bank_ifsc ? <KV k="IFSC" v={co.bank_ifsc} /> : null}
                {co.upi_id ? <KV k="UPI" v={co.upi_id} /> : null}
              </View>
            </View>
          </Section>
        )}

        {(co.quote_terms || q.notes) && (
          <Section title="Terms and conditions" wrap>
            {q.notes ? <Text style={{ marginBottom: 6, color: C.ink }}>{q.notes}</Text> : null}
            {co.quote_terms ? <Bullets text={co.quote_terms} /> : null}
            {co.gstin ? <Text style={{ marginTop: 4, color: C.muted }}>GSTIN: {co.gstin}</Text> : null}
          </Section>
        )}

        <View style={[s.row, { marginTop: 24, gap: 40 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            <View style={{ height: 36 }} />
            <View style={{ borderTopWidth: 1, borderTopColor: C.body, paddingTop: 4 }}>
              <Text style={s.strong}>For {co.name}</Text>
              {preparedBy ? <Text style={{ color: C.muted }}>{preparedBy}</Text> : null}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ height: 36 }} />
            <View style={{ borderTopWidth: 1, borderTopColor: C.body, paddingTop: 4 }}>
              <Text style={s.strong}>Accepted by customer</Text>
              <Text style={{ color: C.muted }}>{q.customer_name} · Date</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export const makeProposalPdf = (input: ProposalInput) => pdf(<Proposal {...input} />).toBlob();

// ---------------------------------------------------------------- Payment statement
export interface StatementInput {
  co: Company;
  customer: { name: string; phone: string; address: string; customer_no: string };
  project: { project_no: string; system: string; total_cost: number | null };
  payments: { txn_no: string; txn_date: string; label: string; mode: string; reference: string | null; amount: number }[];
}
function Statement({ co, customer, project, payments }: StatementInput) {
  const received = payments.reduce((a, p) => a + Number(p.amount), 0);
  const pending = Math.max((project.total_cost ?? 0) - received, 0);
  const sorted = [...payments].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  return (
    <Document title={`${co.name} payment statement · ${customer.name}`} author={co.name}>
      <Page size="A4" style={s.page} wrap>
        <Header right={`Payment statement · ${d(new Date().toISOString())}`} />
        <Footer co={co} />
        <Text style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Payment statement</Text>
        <Text style={{ color: C.muted, marginBottom: 16 }}>As on {d(new Date().toISOString())}</Text>
        <View style={[s.row, { gap: 20, marginBottom: 18 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.th}>Customer</Text>
            <Text style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginTop: 3 }}>{customer.name}</Text>
            {customer.address ? <Text>{customer.address}</Text> : null}
            <Text>Mobile: {customer.phone}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <KV k="Customer no." v={customer.customer_no} />
            <KV k="Project no." v={project.project_no} />
            <KV k="System" v={project.system} />
          </View>
        </View>
        <View style={[s.row, { gap: 8, marginBottom: 18 }]}>
          {[["Project cost", rs(project.total_cost), C.cloud, C.ink], ["Received", rs(received), C.greenTint, C.green], ["Balance due", rs(pending), pending > 0 ? C.orangeTint : C.cloud, pending > 0 ? C.orange : C.ink]].map(([k, v, bg, fg]) => (
            <View key={k} style={{ flex: 1, borderRadius: 8, padding: 12, backgroundColor: bg }}>
              <Text style={{ fontSize: 8, color: C.muted }}>{k}</Text>
              <Text style={{ fontSize: 16, fontWeight: 700, color: fg, marginTop: 3 }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={[s.row, { backgroundColor: C.navy, borderRadius: 4 }]}>
          {[["Date", 70], ["Receipt no.", 70], ["Details", 0], ["Mode", 80], ["Amount", 80]].map(([h, w]) => (
            <Text key={h} style={[s.cell, s.th, { color: "#FFFFFF", ...(w ? { width: w as number } : { flex: 1 }), textAlign: h === "Amount" ? "right" : "left" }]}>{h}</Text>
          ))}
        </View>
        {sorted.length === 0 && <Text style={[s.cell, { color: C.muted }]}>No payments recorded yet.</Text>}
        {sorted.map((p) => (
          <View key={p.txn_no} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.rule }]} wrap={false}>
            <Text style={[s.cell, { width: 70 }]}>{d(p.txn_date)}</Text>
            <Text style={[s.cell, { width: 70 }]}>{p.txn_no}</Text>
            <Text style={[s.cell, { flex: 1 }]}>{p.label}{p.reference ? ` · ${p.reference}` : ""}</Text>
            <Text style={[s.cell, { width: 80 }]}>{p.mode}</Text>
            <Text style={[s.cell, { width: 80, textAlign: "right", color: C.ink, fontWeight: 600 }]}>{rs2(Number(p.amount))}</Text>
          </View>
        ))}
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 8 }]}>
          <View style={{ width: 230 }}>
            <KV k="Total received" v={rs2(received)} bold />
            <KV k="Balance due" v={rs2(pending)} bold />
          </View>
        </View>
        {(co.bank_account_no || co.upi_id) && pending > 0 && (
          <View style={[s.box, { marginTop: 18 }]} wrap={false}>
            <Text style={[s.strong, { marginBottom: 4 }]}>Pay the balance to</Text>
            <Text>{[co.bank_account_name, co.bank_name, co.bank_account_no && `A/c ${co.bank_account_no}`, co.bank_ifsc && `IFSC ${co.bank_ifsc}`].filter(Boolean).join(" · ")}</Text>
            {co.upi_id ? <Text>UPI: {co.upi_id}</Text> : null}
          </View>
        )}
        <Text style={{ marginTop: 24, fontSize: 8, color: C.muted }}>This is a computer-generated statement from {co.name}. For any query call {co.phones}.</Text>
      </Page>
    </Document>
  );
}
export const makeStatementPdf = (input: StatementInput) => pdf(<Statement {...input} />).toBlob();

/** Save a blob to the device. */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
/** Share the PDF file itself where the phone allows it (WhatsApp shows up in the share list). Returns false if not possible. */
export async function shareFile(blob: Blob, name: string, text: string) {
  const file = new File([blob], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.canShare?.({ files: [file] })) return false;
  try { await nav.share({ files: [file], text, title: name }); return true; }
  catch (e) { if ((e as Error).name === "AbortError") return true; return false; }
}

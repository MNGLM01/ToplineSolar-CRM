const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹ with Indian grouping: ₹1,25,000 */
export const rupees = (n: number | null | undefined) => (n == null ? "—" : `₹${inr.format(Math.round(n))}`);

/** Short ₹: ₹1.25 L, ₹2.1 Cr */
export const rupeesShort = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  return rupees(n);
};

export const fmtPhone = (p: string | null | undefined) => (p && p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p ?? "");

/** Normalise any Indian mobile input to 10 digits, or null if invalid. */
export const normaliseMobile = (raw: string | number | null | undefined): string | null => {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
export const fmtDate = (s: string | null | undefined) => (s ? dateFmt.format(new Date(s)) : "—");
export const fmtTime = (s: string) => timeFmt.format(new Date(s));
export const fmtDateTime = (s: string | null | undefined) => (s ? `${fmtDate(s)}, ${fmtTime(s)}` : "—");

export const isToday = (s: string) => new Date(s).toDateString() === new Date().toDateString();
export const isOverdue = (s: string) => new Date(s).getTime() < Date.now();

/** "in 2 h", "3 days ago", "today 4:30 pm" */
export function relTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s); const diff = d.getTime() - Date.now(); const abs = Math.abs(diff);
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (abs < min) return "just now";
  if (isToday(s)) return abs < hr ? `${Math.round(abs / min)} min ${diff < 0 ? "ago" : "from now"}` : `today ${fmtTime(s)}`;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${fmtTime(s)}`;
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${fmtTime(s)}`;
  const days = Math.round(abs / day);
  if (days < 30) return diff < 0 ? `${days} days ago` : `in ${days} days`;
  return fmtDate(s);
}

/** For <input type="datetime-local"> */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const waLink = (phone: string, text = "") => `https://wa.me/91${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
export const telLink = (phone: string) => `tel:+91${phone}`;

export type Role = "owner" | "office_manager" | "sales" | "partner";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  sales: "Sales Executive",
  partner: "Referral Partner",
};

export interface Profile {
  id: string; full_name: string; phone: string | null; email: string | null;
  role: Role; partner_id: string | null; active: boolean; created_at: string;
}
export interface Stage { id: number; name: string; sort: number; color: string; is_won: boolean; is_lost: boolean; active: boolean; }
export interface Source { id: number; name: string; sort: number; active: boolean; }
export interface LostReason { id: number; name: string; sort: number; active: boolean; }
export interface Partner {
  id: string; name: string; phone: string; area: string | null;
  commission_type: "per_kw" | "per_installation" | "percent"; commission_value: number;
  active: boolean; notes: string | null; created_at: string;
}
export type Temperature = "hot" | "warm" | "cold";
export interface Lead {
  id: string; lead_no: string; name: string; phone: string; whatsapp: string | null; alt_phone: string | null;
  email: string | null; address: string | null; village: string | null; district: string | null; pincode: string | null;
  state: string; monthly_bill: number | null; roof_type: string | null; customer_type: string;
  sanctioned_load_kw: number | null; discom: string | null;
  source_id: number | null; partner_id: string | null; stage_id: number; temperature: Temperature | null;
  assigned_to: string | null; deal_value: number | null; lost_reason_id: number | null;
  next_followup_at: string | null; won_at: string | null; notes: string | null; last_activity_at: string;
  created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}
export interface Activity { id: number; lead_id: string; type: string; body: string | null; meta: Record<string, unknown>; user_id: string | null; created_at: string; }
export interface Followup {
  id: string; lead_id: string; type: "call" | "visit" | "whatsapp" | "meeting"; title: string; note: string | null;
  due_at: string; status: "pending" | "done" | "cancelled"; owner_id: string | null; completed_at: string | null; outcome: string | null; created_at: string;
}
export interface EstimateSettings { tariff_per_unit: number; units_per_kw_month: number; cost_per_kw: number; subsidy_per_kw_first_2: number; subsidy_third_kw: number; subsidy_max: number; }

export const ROOF_TYPES = ["RCC (concrete)", "Tin shed", "Asbestos", "Ground mount", "Other"];
export const CUSTOMER_TYPES = ["Residential", "Commercial", "Industrial", "Agricultural"];
export const DISTRICTS = ["Kishanganj", "Purnea", "Katihar", "Araria", "Madhepura", "Saharsa", "Supaul", "Darbhanga", "Madhubani", "Muzaffarpur", "Sitamarhi", "Other"];
export const DISCOMS = ["NBPDCL", "SBPDCL"];
export const FOLLOWUP_TYPES = [
  { value: "call", label: "Call" }, { value: "visit", label: "Site visit" },
  { value: "whatsapp", label: "WhatsApp" }, { value: "meeting", label: "Office meeting" },
] as const;

import type { EstimateSettings } from "./types";

export const DEFAULT_ESTIMATE: EstimateSettings = {
  tariff_per_unit: 7, units_per_kw_month: 120, cost_per_kw: 60000,
  subsidy_per_kw_first_2: 30000, subsidy_third_kw: 18000, subsidy_max: 78000,
};

/** PM Surya Ghar residential subsidy: ₹30k/kW for the first 2 kW, ₹18k for the 3rd kW, capped at ₹78k. */
export function subsidyFor(kw: number, s: EstimateSettings = DEFAULT_ESTIMATE) {
  const v = Math.min(kw, 2) * s.subsidy_per_kw_first_2 + Math.min(Math.max(kw - 2, 0), 1) * s.subsidy_third_kw;
  return Math.min(v, s.subsidy_max);
}

/** Quick solar plan from a monthly bill. A rough guide for the first conversation, not a quotation. */
export function estimateFromBill(bill: number, s: EstimateSettings = DEFAULT_ESTIMATE, customerType = "Residential") {
  const units = bill / s.tariff_per_unit;
  const kw = Math.max(1, Math.round((units / s.units_per_kw_month) * 2) / 2); // nearest 0.5 kW, min 1 kW
  const cost = kw * s.cost_per_kw;
  const subsidy = customerType === "Residential" ? Math.min(subsidyFor(kw, s), cost) : 0;
  const net = cost - subsidy;
  const monthlySavings = Math.min(bill, kw * s.units_per_kw_month * s.tariff_per_unit);
  const paybackYears = monthlySavings > 0 ? net / (monthlySavings * 12) : 0;
  return { kw, cost, subsidy, net, monthlySavings, annualUnits: kw * s.units_per_kw_month * 12, paybackYears };
}

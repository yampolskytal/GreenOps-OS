/** Exact headers and row order of the organisers' templates. Do not edit without updating the templates. */
export const BASELINE_HEADER = ["parameter", "must_or_bonus", "value_low", "value_mid", "value_high", "unit", "source", "calculation_or_assumption"] as const;
export const BASELINE_ROWS: { parameter: string; must_or_bonus: "Must" | "Bonus"; unit: string }[] = [
  ["total_cost_baseline_year_chf", "Must", "CHF per year"], ["total_energy_baseline_year_kwh", "Must", "kWh per year"],
  ["total_co2_location_based_baseline_year_kg", "Must", "kg CO2 per year"], ["total_co2_market_based_baseline_year_kg", "Bonus", "kg CO2 per year"],
  ["grid_mix_location_based_switzerland", "Must", "kg CO2 per kWh"], ["grid_mix_location_based_germany", "Must", "kg CO2 per kWh"],
  ["grid_mix_location_based_ireland", "Must", "kg CO2 per kWh"], ["grid_mix_market_based", "Bonus", "kg CO2 per kWh"],
  ["energy_per_vcpu_hour", "Must", "kWh"], ["energy_per_node_hour", "Must", "kWh"], ["energy_per_gpu_hour", "Must", "kWh"],
  ["energy_per_gb_storage_day", "Must", "kWh"], ["energy_per_1000_tokens", "Must", "kWh"], ["energy_per_subscription_message", "Must", "kWh"],
  ["pue", "Must", "ratio"], ["growth_per_year", "Bonus", "percent"], ["allocation_rule_shared_costs", "Must", "text"],
].map(([parameter, must_or_bonus, unit]) => ({ parameter: parameter!, must_or_bonus: must_or_bonus as "Must", unit: unit! }));
export const MEASURES_HEADER = ["measure_id", "description", "resource_or_source", "change", "effort_person_days", "savings_cost_chf_per_year", "savings_energy_kwh_per_year", "savings_co2_kg_location_based", "savings_co2_kg_market_based", "risks_and_exceptions", "assumptions_and_sources"] as const;

const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Templates are UTF-8 with BOM; keep it so Excel opens them identically. */
export const toCsv = (header: readonly string[], rows: (string | number)[][]) => "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";

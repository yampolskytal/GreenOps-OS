/** Locale-independent Swiss grouping (1'234) so server and browser render identically. */
export const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
export const chf = (n: number) => `CHF ${group(n)}`;
export const kchf = (n: number) => (Math.abs(n) >= 1000 ? `CHF ${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : chf(n));
export const kg = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} t` : `${group(n)} kg`);
export const kwh = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} MWh` : `${group(n)} kWh`);
export const pct = (n: number) => `${n.toFixed(1)}%`;

/** Demonstration research; company metadata has no fabricated market prices. */
import { portfolioHoldings } from "./portfolio.ts";
export type Company = (typeof portfolioHoldings)[number];
export const companies = portfolioHoldings;
export const sectors = [...new Set(companies.map((c) => c.sector))];
export function money(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}
export function percent(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
export const researchCompanies = [
  ...companies.slice(0, 6).map((c) => ({ symbol: c.symbol, name: c.name })),
  { symbol: "DMART", name: "Avenue Supermarts" },
  { symbol: "DIXON", name: "Dixon Technologies" },
  { symbol: "TRENT", name: "Trent" },
  { symbol: "KPITTECH", name: "KPIT Technologies" },
];

// Financial screens use the same price-free holding definition as the backend.
export { portfolioHoldings, type Holding } from "./portfolio.ts";

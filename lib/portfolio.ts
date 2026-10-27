import config from "../data/portfolio.json" with { type: "json" };
export const portfolioHoldings = config.holdings;
export const purchaseDate = config.purchase_date;
export type Holding = (typeof portfolioHoldings)[number];

# Three example questions

These three questions show what your solution should be able to answer. They are examples, not a complete checklist. The jury will ask similar questions on Sunday. You can answer them with a dashboard, a table or an assistant.

## 1. Find
**Question:** How many AI subscription seats were purchased but not active in August 2026, and what do they cost per month?

**A good answer** gives the purchased and the active seats per product, converts the costs into CHF and says which file the figures come from.

**Sources:** `ai_subscriptions.csv`, `exchange_rates.csv`

## 2. Decide
**Question:** What does it bring to start the GPU server only when needed? State the effort and the savings in CHF and CO₂ (location-based) per year.

**A good answer** shows today's utilisation, estimates effort and savings with an open calculation and states the assumptions (energy per GPU hour, electricity mix at the location) with source and range.

**Sources:** `azure_costs.csv`, `server_inventory.csv`, `server_metrics_weekly.csv`, `it_tickets.csv`

## 3. Know the limits
**Question:** May the production platform be switched off at night and at weekends?

**A good answer** does not simply say yes or no. It names the times when the platform is needed, backs them up with the data and says who has to decide before implementation.

**Sources:** `data_platform_usage.csv`, `it_tickets.csv`, `business_calendar.csv`, `mapping_departments_tools.csv`

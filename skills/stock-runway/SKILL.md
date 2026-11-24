---
name: stock-runway
description: "Use when the user asks about inventory coverage, likely stock run-out, or forecast reliability."
---

# Stock Runway

Use `stock_runway` to estimate when an item may run out and to check how closely recent forecasts matched sales.

## Explain the result

- Give a short plain-text answer from the tool's `summary`, and explain any error or held-item reason. Full item details are in `items`.
- Forecast demand uses last year's monthly seasonal pattern scaled to the deseasonalised level of the last three months, rounded up to whole units. Factors are limited to 0.5–2 times average demand because one year is noisy. With fewer than 12 months, it uses the latest three months average and explains why seasonal ups and downs are unavailable. Stock is rounded down. Historical accuracy grades keep the existing three-month-average backtest.
- The month shown is the first month-end at or below zero in the selected horizon. It is an estimate, never a certain date.
- “Usable for planning” means historical error was at most 15%; “Use with care” means at most 30%; “Too far off to plan on” means error was higher. These describe a small recent backtest, not a guarantee.
- Fewer than seven months gives “Not enough history to check.” Say so plainly.
- Zero actual sales in the four backtested months gives “No recent sales to check.” Do not describe that as a reliability grade.
- Repeat the tool's disclosure line. It reflects positive receipts included within the selected horizon, not all receipts in the source. Never imply that the tool placed or recommends a purchase.
- A supplier lead time only produces an order-by date when it is positive; describe that date as an estimate. `order_overdue` means that date is before the as-of date, not necessarily before today.
- When `truncated` is true, explain that only the 50 soonest run-outs are shown, with non-run-out items filling any remaining places; `total_count` is the full matching count. Held items have no forecast; repeat their reason rather than inventing one.

## Sources

The sample source works without setup. For a local file, call with `source="csv"` and an explicit `csv_path`. Odoo is read-only and requires secrets configured in the workspace; never ask the user to put a password or key in chat.

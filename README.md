Lifecycle: living

# Stock Runway

Stock Runway estimates how long current stock may last using recent monthly net sales. It includes an anonymized sample, accepts a local CSV, and has an optional read-only Odoo source. Forecasts are estimates, not promises or purchase orders.

## Install

```bash
hermes plugins install usegreymatter/hermes-stock-runway
hermes plugins enable stock-runway
```

Then restart Hermes Desktop and open **Stock Runway** in the sidebar (or type `/stock` in any chat). It opens on built-in sample data, so there is nothing to configure. Load your own stock with **My file (CSV)** — exports from SAP Business One, SAP S/4HANA, NetSuite, Zoho Inventory, QuickBooks, Dynamics 365, Odoo, Sage and similar work without renaming columns.

## Chat tool

The single `stock_runway` tool works in CLI, Telegram, Desktop, and other Hermes chat surfaces.

```json
{"source":"sample","horizon":6,"skus":["SEAL-CLR-300"]}
```

Forecast demand is the average of the latest three full months rounded up; current stock is rounded down. Projected stock subtracts forecast demand and adds confirmed receipts. Run-out means the first month-end at or below zero. Error grades compare four held-out months against a three-month average. They are a small historical check, not a guarantee.

The horizon is 1–12 whole months (integral JSON numbers such as `6.0` are accepted). With no SKU filter, more than 50 results are limited to the 50 soonest run-outs, followed by valid items without a run-out and then held items; the response includes `truncated: true` and `total_count`. Summary lines match the returned items. The disclosure counts only positive receipts included in those items' selected forecast horizon; held items do not contribute receipts. `order_overdue` is true only when the estimated order-by date is before the as-of date, not when it equals that date. A backtest with zero actual sales in its four checked months reports “No recent sales to check,” not a reliability grade.

## Local CSV

### Works with your ERP's export

You don't need to rename columns. Export your stock list with monthly sales from your ERP and load it as is — Stock Runway recognises the usual column names from **SAP Business One, SAP S/4HANA, NetSuite, Zoho Inventory, QuickBooks, Microsoft Dynamics 365, Odoo and Sage**, in any order:

| Stock Runway needs | Also accepted (examples) |
|---|---|
| `sku` | Item Code, ItemCode, Item number, Product Code, Internal Reference, Part Number, SKU |
| `name` | Item Name, Product name, Display Name, Description, Product/Service |
| `unit` *(optional, default "units")* | UoM, Unit of Measure, Usage Unit, Inventory unit, InvntryUom |
| `on_hand` | Qty On Hand, Quantity On Hand, Stock On Hand, OnHand, Available, In Stock |
| `supplier_days` *(optional)* | Lead Time, Lead Time (days), Vendor Lead Time, Purchase Lead Time |
| `category` *(optional)* | Category, Item Group, Product Category, ItmsGrpNam |
| monthly sales | `2026-01`, `2026/01`, `01/2026`, `Jan 2026`, `January 2026`, `Jan-26` |

Other columns (price, cost, internal IDs) are ignored, and numbers like `"1,200"` are read as 1200. Ready-made examples for each ERP are in [`docs/erp-examples/`](docs/erp-examples/). Files already in the format below load exactly as before.


The optional `category` column and `rcv:YYYY-MM` historical delivery columns may follow the five required prefix columns alongside the sales columns. If any `rcv:` column is supplied, supply exactly one for **every** sales month, including explicit `0` quantities for months with no deliveries. Duplicates, invalid/out-of-range months, partial coverage, blank quantities and negative/non-finite quantities are rejected consistently in Python and the browser. No `rcv:` columns means delivery history is absent, not zero. These historical columns do not add future receipts.

Pass an explicit local path with `source=csv` and `csv_path`. The first five columns must be `sku,name,unit,on_hand,supplier_days`; append at least three chronological, unique `YYYY-MM` columns containing monthly net sales. Leave `supplier_days` empty if unknown. Numeric values must be non-negative. Files are capped at 2 MiB and 10,000 item rows. An optional receipts CSV passed as `receipts_path` uses the exact columns `sku,month,quantity`; only listed confirmed receipts are added. Receipt months must be after the last sales month and no more than 12 months later. `csv_path` can read any local CSV the agent is pointed at; it is not restricted to the plugin directory. Paths are trusted local files selected by the user; this plugin does not write them. Do not pass files containing data you are not authorized to expose to Hermes.

### Supported numeric and calendar bounds

Sales labels must be consecutive calendar months from **1000-01 through 9998-12** in both Python and JavaScript. The upper bound reserves a full 12-month forecast through year 9999; the lower bound preserves the existing 65,000-month history fixture (1000-01 through 6416-08) and ample order-date headroom. Supplier lead time is **0–3650 days** (empty means unknown). Source CSV errors identify the row and field. Direct engine/browser callers get held items for invalid labels, dates or values; unsupported horizons still produce a request error.

Each stock, sales-month, historical-delivery-month or future-receipt-month quantity is capped at **1,000,000,000,000** in product units. This is well above the normal 9,999,999 stress case. Duplicate future receipts must stay under the same monthly cap. Fake-Odoo-tested conversion, quant totals, net-sales totals, current-month rollback and incoming-delivery totals enforce that bound before converting Decimal values to floats. An out-of-range stock/sales item is held; a failure confined to incoming history omits the entire history map, preserving the existing unknown-history policy. Intermediate signed Odoo totals are also bounded, so a later offset cannot erase an earlier range failure.

Calculated sums, reconstructed balances and percentage ratios must remain finite and within an absolute **1e18** arithmetic bound. This accommodates the full supported history at the individual quantity cap (under 1.1e17 total) while stopping overflow and extreme ratios. An unexpected per-item calculation exception yields “Couldn't calculate: check this item's data.” without exposing exception text; other items remain usable. Missing or invalid delivery history remains explicitly unknown.

Small quantities show up to two decimals below 10; a smaller nonzero magnitude displays `<0.01` (with a minus sign for negative values). Forecast demand still uses integer ceiling. Quality uses unrounded sales: existing integer percentages remain, but an error that would round to zero retains its nonzero value and displays `<0.01%` when needed. Exactly constant fractional sales have zero error.

## Odoo

Supported Odoo versions are 17, 18 and 19; unit conversion is tested against fake responses only, not live servers. Odoo is optional and read-only. Configure `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, and `ODOO_API_KEY` using Hermes secret settings. The plugin never asks for credentials in its UI or chat. It requests only product name/code/unit/category and completed stock move fields needed for internal/customer/supplier movement calculations. It reads internal-location quants and rolls back subsequent completed moves to the last full month end. It reads location usage to classify internal, customer and supplier movements, and optional supplier delay fields only. It does not query partner records, customer records or prices. Odoo requires an explicit list of 1–50 SKUs and an HTTPS URL. Never point tests at a real Odoo server.

Only `search_read` is allowed for model reads; authentication is a separate handshake. The exact `ALLOWED_FIELDS` table is:

| Model | Fields |
| --- | --- |
| `stock.location` | id, usage |
| `stock.move` | product_id, product_uom_qty, product_uom, quantity, date, state, location_id, location_dest_id |
| `stock.quant` | product_id, quantity, location_id |
| `product.product` | id, name, default_code, uom_id, product_tmpl_id, categ_id |
| `product.supplierinfo` | product_tmpl_id, product_id, delay |
| `uom.uom` | id, factor, category_id, parent_path |

Move quantities are converted to the product unit when possible. Odoo 17/18 uses matching `category_id` values and `quantity / move.factor * product.factor`; Odoo 19 falls back from an invalid `category_id` field to `parent_path`, checks matching first path segments, and uses `quantity * move.factor / product.factor`. Unit reads include archived units with `context={"active_test": false}`; no other model accepts a context option. An item with an unconvertible sales/return or current-month stock rollback move is held with “Some moves use a unit that cannot be converted.” Invalid quantities in those moves retain their existing errors. A failure confined to a historical incoming supplier delivery omits that item's entire `historical_receipts` map, leaving otherwise valid net sales, stock and forecast usable. Internal transfers do not hold an item.

### Known limitations

- The same bounded completed-move read includes supplier-to-internal receipts for the history window, converted to product units. Supplier location usage is requested alongside internal/customer usage; the category display name comes from `categ_id`. With no supplier locations, incoming coverage is unknown and `historical_receipts` is omitted. With supplier locations and valid coverage but no historical deliveries, the complete map contains explicit zeros. Invalid history-only incoming quantities or unit conversions omit the entire item's map rather than publishing partial history; the UI requests delivery history. No purchase-order fetch is added. Existing future receipts remain the only future supply.

- UTC month bucketing may differ from local business-month boundaries.
- Odoo 16 or older falls back to `product_uom_qty`, the planned quantity, when the completed `quantity` field is unavailable.
- Historical stock rollback assumes moves complete at their recorded move date; it cannot reconstruct unrecorded completion timing or earlier quant corrections.

## Desktop

The full-page Stock Runway page places the **Order now** list directly after the title, before source controls. Its per-row order sentence is larger and bolder than the product/SKU and explanation. Each row gives the product name and SKU, suggested quantity (whole units or the configured pack size), order-by date and a short run-out/delivery explanation. Selecting a row opens that product. The product view begins with the same plain order answer, followed by the existing stock headline, chart and disclosures. Quantity means the amount to buy **on the displayed order date**. The planned date is the later of today and order-by; its endpoint adds whole supplier lead days and `ceil(months_of_cover × 30)` cover days. Forecast demand runs from the snapshot month-end through that endpoint, subtracting exact snapshot `on_hand` and confirmed receipts due after the snapshot through the endpoint (inclusive). Minimum/pack rounding applies only to positive need. Demand follows snapshot-anchored calendar months: a complete month consumes one monthly forecast, and a partial month consumes elapsed days divided by that month's actual length. The 30-day conversion sets the cover endpoint only; it is not a daily demand rate. Run-out is the first day projected balance reaches zero, using the chart's rounded-down opening stock and extending beyond the selected horizon. Every guidance calculation treats receipts as available from the start of their month, including today's balance and quantity-horizon receipts. The earliest crossing determines order-by, buckets and order answers even when a later receipt restores stock. Out-of-stock describes projected balance today; a temporary gap retains its original crossing date and names the later delivery month, quantity and unit. These projections do not claim observed current stock. Supplier fractions round up to whole delivery days. A stale snapshot displays “Stock figures as of <date>”; dates include the year. This is a local estimate, not a purchase order.

The product browser combines search, flat/type presentation and counted exclusive filters: Order now, Running low, Healthy, Overstocked, No sales and Needs data. Counts follow search and cover all matches before the browser’s visible 50-item cap. The Order now panel matches its chip count and includes every matching row in a scrolling list, including zero-purchase attention rows. When empty, it names the earliest upcoming order date even if its quantity is zero. Bucket priority is Needs data > Order now > Running low > No sales > Overstocked > Healthy. Held products and products without a usable delivery-time estimate when no default is set appear under Needs data with a reason. Advanced settings start collapsed and persist locally: default delivery time, months of cover, overstock threshold, editable urgent/running-low date windows, and product-specific minimum order and pack size. Reset removes product overrides as well as restoring defaults. Every numeric control keeps draft text during keyboard edits; valid values recompute immediately, optional blanks clear on blur, and invalid drafts retain the previous calculation with a visible error. Blurring a blank required field retains the blank draft and explains which previous value is still used. Fractional packs/minimums support 0.000001–1e12 with up to six decimal places. Exact decimal rounding never orders below a positive requirement or minimum; zero need ignores the minimum. Derived orders may exceed the 1e12 source-cell cap, up to safe decimal precision and the inherited 1e18 arithmetic bound (absolute order ceiling 9007199254740991). A zero purchase quantity can still mean a supply gap: out-of-stock items remain in Order now, with a selectable explanation instead of an Order 0 purchasing sentence. Empty stock with zero recent sales explicitly suggests no quantity; positive stock with zero sales in the last three months reaches No sales before Overstocked.

The full-page chart shows solid historical demand, outlined forecast demand, green monthly deliveries and month-end inventory. `historical_receipts` is a separate complete map of sales-history months to delivered quantities. Inventory is rebuilt backward from the dataset's exact `on_hand` at the last full month: `end[m] = end[m+1] + sold[m+1] - delivered[m+1]`. Raw negative balances remain available in the reconstruction result; only plotted values are clamped. One warning identifies the boundary before the latest negative historical balance. Missing or partial history suppresses the historical inventory line and requests delivery history. Historical receipts never affect forecast demand, current stock rounding or the future projection. Future shortages are clipped visually at zero while the table retains the signed balance; confirmed deliveries may restore positive inventory. The sample's added receipt history is explicitly synthetic.

Each paired bar group fills one calendar-month slot. For `n` historical months, history month `i` ends at boundary `x(i+1)`, Now is `x(n)`, future month `i` ends at `x(n+i+1)`, and a fractional runout is `x(n+crossing.month)` (zero-based month indexes). The latest historical balance is at Now, with no extra half-month plateau. If exact `on_hand` differs from rounded-down forecast stock, both values meet at the same Now coordinate and the caption explains the rounding; forecast numbers and runout dates are unchanged.


The unified package includes a native Desktop page at `/stock-runway`. The sample is available immediately. “Load CSV” parses the selected file in the browser; it does not upload it. CSV parsing and forecast evaluation complete before the new dataset is saved; rejected uploads retain the previous good CSV. Page and quick-view recovery controls handle invalid saved datasets and unexpected render failures, with usable **Back to sample data** and **Choose another file** controls. Pending file reads are discarded after a source switch, unmount or recovery. Storage changes occur in user events, never render. The selected source, parsed CSV and last page horizon are kept in plugin-local `ctx.storage`, so quick view uses the same data even after leaving the page or restarting Desktop. Choosing Sample keeps the CSV available locally. The Settings page explains Odoo secret setup and offers a default-horizon control. `default_horizon` applies to the Desktop page and quick view. Changing that default resets the last page horizon; the chat tool defaults to six months unless its `horizon` argument is supplied.

The Advanced default delivery time accepts 1–3650 whole days or a blank. Clearing it saves `null` on blur; products with unknown supplier delivery time then show “Needs data — No delivery time — set one in Advanced”. Zero, negative and text drafts show an error and retain the saved default. A product's source `supplier_days=0` remains valid. Required fields retain their existing draft/blur behavior.

### Popup quick view

In ⌘K, choose **Stock Runway: quick view** (keywords: stock, inventory, runway), or press **⌘⇧I** on macOS / **Ctrl+Shift+I** elsewhere. The shortcut is rebindable in Desktop settings (View category). **Ctrl+Shift+I opens DevTools on Windows and Linux; rebind this shortcut there.** The status-bar **Stock** button opens the same native SDK Dialog. Its compact table lists Item, Runs out, Stock, Per month and Plan confidence, soonest first (including run-out day within a month) with held items last. The Dialog lives in the titlebar center mount, independently of the optional status bar, so palette/shortcut opening still works with the status bar hidden or in Simple mode. If a chrome-owning page omits the titlebar host, opening is ignored and unmount clears stale open state; returning does not unexpectedly reopen it. Dates and the existing urgency dots lead the answer; the same confidence badges are used on the full page. Narrow views scroll the table horizontally rather than hiding columns. **Open full page** closes the popup and navigates to `/stock-runway`.

### Inline chat table

A successful `stock_runway` tool response includes the plain `summary` and a `card` line. The skill asks the model for a short one-line answer followed by that exact card line alone in its own paragraph (not a code fence). Desktop's `stock-runway` transcript directive renders the same table as quick view. On non-Desktop surfaces, older Desktop builds, or with this plugin disabled, the encoded directive may appear as a raw text line; the plain summary remains usable. `/stock` deliberately remains a text-only command, not a popup/card trigger.

The card contains only `{as_of,horizon,disclosure,rows,more}` and the bounded presentation fields, encoded as UTF-8 unpadded base64url. The **entire directive line is capped at 1,900 ASCII characters**, below Desktop’s 2,048-character brace-body cap and 4,800-character paragraph limit. At most 50 rows are considered, soonest first with held items last; trailing lower-priority rows are removed until the line fits. `more` counts every omitted item, including rows excluded by the tool’s 50-item presentation cap. The card shows **+N more, open full page** as a navigation button. The full plain result and summary are unchanged by card truncation. A single oversized row may leave an empty card with a `more` count. Long names/SKUs are bounded; rows with missing or whitespace-only bounded identifiers are skipped instead of losing the whole card. Malformed Unicode omits the optional card without converting the successful tool result into an error. The Desktop decoder validates exact keys, dates, horizon, finite nonnegative quantities, grades, held-item shape, unique SKUs, UTF-8, a nonnegative integer `more`, and encoding/length. Invalid attributes render nothing. Card content is text, not HTML or executable code.

### SDK contract and local evidence

Verified against the local Desktop source (read-only):

- `apps/desktop/src/lib/transcript-directives.ts` **61–77** defines the 2,048-character brace-body cap; **196–214** rejects paragraphs above 4,800 characters and refuses oversized brace bodies. The 1,900-character limit includes the wrapper, not just the payload.
- `website/docs/developer-guide/desktop-plugin-sdk.md` **340–348** documents titlebar slots as permanent mounts across chat/full-page navigation. `apps/desktop/src/sdk/index.ts` **126–127** re-exports `sdk/areas.ts`, whose **7–11** documents and exports `TITLEBAR_AREAS.center`. `apps/desktop/src/app/contrib/controller.tsx` **838–846** explicitly unmounts the status bar when hidden: retaining a status-bar render across rerenders is not sufficient.
- The local `desktop-plugins/focus-tree-preview/plugin.js` **119–132**, **195–198**, **245–253** provides the mount-effect/unmount stale-open clearing pattern, titlebar-center Dialog host, and `view` keybind category used here.
- SDK guide **359–389** covers palette/keybind payloads; **1100–1149** covers transcript directives. `apps/desktop/src/sdk/index.ts` **1721–1729**, **1844**, **1891–1897** exports the Dialog, keybind and transcript surfaces.


## Validation




Run `/usr/bin/python3 -m pytest tests -q` and `PYTHON=/usr/bin/python3 node tests/desktop.test.mjs` from the repository root. Python implementation and tests use only the standard library plus pytest as the test runner; the desktop file imports only the Hermes SDK and its documented React runtime.




```sh
git diff --check
```

`tests/fixtures/original-sample.json` is the immutable original sample extracted once from `0468a3802c08020058887f5070fcd0139094fe26:data/sample.json`, pinned by SHA256 in the inventory-history regression. Tests read that fixture without Git or repository history; expected sample forecast numbers also remain independently specified in `tests/test_engine.py`.

## Slash command

`/stock` prints the run-out list with no model call. `/stock SKU1 SKU2` shows only those items, and `/stock path/to/file.csv` runs on your own CSV.

"""Chat-surface stock_runway tool."""
from __future__ import annotations

import json
from pathlib import Path

from .engine import forecast, month_label, held_item
from .sources import OdooReadOnly, SourceError, load_csv, load_sample

TOOL_SCHEMA = {
    "name": "stock_runway",
    "description": "Estimate when stock runs out and how reliable the estimate has been. Read-only. Answer in plain text from the returned summary and disclosure.",
    "parameters": {"type": "object", "properties": {
        "source": {"type": "string", "enum": ["sample", "csv", "odoo"], "default": "sample"},
        "csv_path": {"type": "string", "description": "Explicit path to a local sales CSV; required when source=csv."},
        "receipts_path": {"type": "string", "description": "Optional local confirmed-receipts CSV path."},
        "skus": {"type": "array", "items": {"type": "string"}, "maxItems": 50, "description": "Only return these SKUs. Required for Odoo, at most 50."},
        "horizon": {"type": "integer", "minimum": 1, "maximum": 12, "default": 6},
    }, "required": []},
}


def _line(item: dict, horizon: int) -> str:
    if item.get("held"):
        return f"{item.get('sku') or 'Item'}: held — {item['reason']}"
    timing = f"runs out {month_label(item['runout_month'])}" if item["runout_month"] else f"does not run out within {horizon} months"
    return f"{item['sku']}: {timing}; {item['grade']}"


def make_handler(secret_getter=None, sample_path: Path | None = None):
    def stock_runway(args: dict, **_: object) -> str:
        args = args if isinstance(args, dict) else {}
        source = args.get("source", "sample")
        try:
            horizon = args.get("horizon", 6)
            if isinstance(horizon, bool) or not isinstance(horizon, (int, float)) or not 1 <= horizon <= 12 or int(horizon) != horizon:
                raise SourceError("Horizon must be a whole number from 1 to 12.")
            horizon = int(horizon)
            if source == "sample":
                data = load_sample(sample_path)
            elif source == "csv":
                data = load_csv(args.get("csv_path"), args.get("receipts_path"))
            elif source == "odoo":
                data = OdooReadOnly(secret_getter).load(args.get("skus"))
            else:
                raise SourceError("Source must be sample, csv, or odoo.")
            wanted = args.get("skus")
            if wanted is not None and (not isinstance(wanted, list) or any(not isinstance(x, str) for x in wanted)):
                raise SourceError("SKUs must be a list of text values.")
            items = [item for item in data.get("items", []) if wanted is None or item.get("sku") in wanted]
            if wanted is not None:
                missing = [sku for sku in wanted if sku not in {item.get("sku") for item in data.get("items", [])}]
                if missing:
                    raise SourceError("One or more requested SKUs were not found.")
            results = []
            for item in items:
                try:
                    results.append(forecast(item, data["months"], data["as_of"], horizon))
                except Exception:
                    # Never expose exception text: it may contain private source values.
                    results.append(held_item(item))
            total_count = len(results)
            truncated = wanted is None and total_count > 50
            if truncated:
                results = sorted(results, key=lambda item: (item.get("held", False), item.get("runout_day") or "9999-12-31"))[:50]
            payload = {"source": source, "as_of": data["as_of"], "horizon": horizon,
                       "disclosure": ("Includes recorded receipts; assumes nothing else is on order." if any(
                           row["receipts"] > 0 for item in results for row in item.get("projection", [])
                       ) else "No receipts recorded; assumes nothing is on order."),
                       "items": results, "summary": [_line(item, horizon) for item in results]}
            if truncated:
                payload.update(truncated=True, total_count=total_count)
            text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            try:
                text.encode("utf-8")
            except UnicodeError:
                # Preserve the plain DTO through JSON escapes, not invalid UTF-8.
                text = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
            return text
        except SourceError as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            return json.dumps({"error": "Stock runway could not read the selected source."}, separators=(",", ":"))
    return stock_runway

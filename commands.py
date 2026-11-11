"""/stock slash command: a quick run-out list with no model call.

Usage:
  /stock                      sample store, soonest run-out first
  /stock SKU [SKU ...]        only these items
  /stock path/to/file.csv     your own CSV (see README for the format)
"""
import json

USAGE = "Usage: /stock  |  /stock SKU [SKU ...]  |  /stock path/to/file.csv"


def build_args(raw: str) -> dict:
    parts = (raw or "").split()
    if parts and parts[0].lower() in {"help", "-h", "--help"}:
        return {"help": True}
    if len(parts) == 1 and parts[0].lower().endswith(".csv"):
        return {"source": "csv", "csv_path": parts[0]}
    args: dict = {"source": "sample"}
    if parts:
        args["skus"] = parts
    return args


def format_result(payload: dict) -> str:
    if "error" in payload:
        return f"Stock Runway: {payload['error']}\n{USAGE}"
    items = payload.get("items", [])
    order = sorted(items, key=lambda i: (bool(i.get("held")), i.get("runout_day") or "9999-12-31"))
    by_sku = {}
    for line in payload.get("summary", []):
        sku, _, rest = line.partition(": ")
        by_sku[sku] = rest
    lines = [f"Stock runway (stock as of {payload.get('as_of')}, next {payload.get('horizon')} months)"]
    for item in order:
        sku = item.get("sku", "?")
        lines.append(f"• {sku}: {by_sku.get(sku, item.get('reason', 'held'))}")
    if payload.get("truncated"):
        lines.append(f"Showing 50 of {payload.get('total_count')} items.")
    lines.append(payload.get("disclosure", ""))
    return "\n".join(line for line in lines if line)


def make_command(tool_handler):
    def stock(raw_args: str = "", **_: object) -> str:
        args = build_args(raw_args)
        if args.get("help"):
            return USAGE
        try:
            payload = json.loads(tool_handler(args))
        except Exception:  # never break the chat over a display command
            return "Stock Runway could not run. " + USAGE
        return format_result(payload)
    return stock

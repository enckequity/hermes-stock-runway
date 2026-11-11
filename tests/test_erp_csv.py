"""ERP export headers (SAP B1, NetSuite, Zoho, QuickBooks, Dynamics) load like the canonical CSV."""
from pathlib import Path
import sys
import types

import pytest

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("stock_runway")
package.__path__ = [str(ROOT)]
sys.modules.setdefault("stock_runway", package)

from stock_runway.sources import SourceError, erp_month, load_csv  # noqa: E402

CANON = "sku,name,unit,on_hand,supplier_days,2026-01,2026-02,2026-03\nA-1,Widget,pcs,1200,30,100,110,120\n"
EXAMPLES = sorted((ROOT / "docs" / "erp-examples").glob("*.csv"))


def _load(tmp_path, body, name="x.csv"):
    p = tmp_path / name
    p.write_text(body, encoding="utf-8")
    return load_csv(str(p))


def test_examples_exist():
    assert {p.stem for p in EXAMPLES} >= {"sap-business-one", "netsuite", "zoho-inventory", "quickbooks", "dynamics-365"}


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.stem)
def test_every_erp_example_matches_canonical(tmp_path, path):
    canon = _load(tmp_path, CANON)
    got = load_csv(str(path))
    item = got["items"][0]
    want = canon["items"][0]
    assert got["months"] == canon["months"]
    assert item["sku"] == want["sku"] and item["name"] == want["name"]
    assert item["on_hand"] == want["on_hand"] and item["monthly_sales"] == want["monthly_sales"]


def test_canonical_file_unchanged(tmp_path):
    assert _load(tmp_path, CANON)["items"][0]["unit"] == "pcs"


def test_missing_unit_and_lead_time_default(tmp_path):
    d = _load(tmp_path, "Item Code,Item Name,Qty On Hand,Jan 2026,Feb 2026,Mar 2026\nA,W,5,1,2,3\n")
    assert d["items"][0]["unit"] == "units" and d["items"][0]["supplier_days"] is None


def test_unknown_columns_dropped_and_any_order(tmp_path):
    d = _load(tmp_path, 'Price,Mar 2026,Qty On Hand,Item Name,Feb 2026,Item Code,Jan 2026\n9.5,3,"1,500",W,2,A,1\n')
    assert d["months"] == ["2026-01", "2026-02", "2026-03"]
    assert d["items"][0]["on_hand"] == 1500 and d["items"][0]["monthly_sales"] == [1, 2, 3]


def test_missing_required_column_still_clear(tmp_path):
    with pytest.raises(SourceError, match="CSV columns must begin.*ERP names"):
        _load(tmp_path, "Item Name,Qty On Hand,Jan 2026,Feb 2026,Mar 2026\nW,5,1,2,3\n")


def test_bad_values_still_rejected(tmp_path):
    with pytest.raises(SourceError, match="non-negative"):
        _load(tmp_path, "SKU,Name,On Hand,Jan 2026,Feb 2026,Mar 2026\nA,W,-5,1,2,3\n")


@pytest.mark.parametrize("label,want", [
    ("2026-01", "2026-01"), ("2026/01", "2026-01"), ("2026-01-31", "2026-01"), ("01/2026", "2026-01"),
    ("Jan 2026", "2026-01"), ("January 2026", "2026-01"), ("Jan-26", "2026-01"), ("Sept 2026", "2026-09"),
    ("Price", None), ("Name", None), ("2026-13", None), ("Janx 2026", None),
])
def test_month_labels(label, want):
    assert erp_month(label) == want

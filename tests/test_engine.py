from pathlib import Path
from fractions import Fraction
import math
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("stock_runway")
package.__path__ = [str(ROOT)]
sys.modules.setdefault("stock_runway", package)

import pytest

from stock_runway.engine import backtest, forecast, validate_item
from stock_runway.sources import load_sample


def test_sample_oracle_independently_recomputed():
    data = load_sample(Path(__file__).parents[1] / "data" / "sample.json")
    expected = {
        "SEAL-CLR-300": (25860, 5689, "2027-04", 9),
        "UL-FOAM-GRN": (8269, 14153, "2026-11", 15),
        "GRT-GRY-5": (1863, 295, "2027-04", 13),
        "TRM-ALU-25": (1125, 153, "2027-05", 21),
        "SEAL-WHT-300": (548, 633, "2026-11", 75),
    }
    for item in data["items"]:
        row = item["monthly_sales"]
        month = "2026-10"
        stock = int(item["on_hand"])
        # Independent rational oracle, factors in history order (Nov..Oct).
        base = Fraction(sum(row), 12)
        factors = [max(Fraction(1, 2), min(2, Fraction(v) / base)) for v in row]
        level = sum(Fraction(row[i]) / factors[i] for i in range(9, 12)) / 3
        demands = [math.ceil(level * f) for f in factors]
        demand = demands[0]
        balance = stock
        runout = None
        for offset in range(1, 13):
            year, mon = map(int, month.split("-"))
            mon += offset
            year += (mon - 1) // 12
            mon = (mon - 1) % 12 + 1
            balance -= demands[offset - 1]
            if balance <= 0 and runout is None:
                runout = f"{year:04d}-{mon:02d}"
        forecasted = [sum(row[i - 3:i]) / 3 for i in range(len(row) - 4, len(row))]
        actual = row[-4:]
        error = int(sum(abs(f - a) for f, a in zip(forecasted, actual)) / sum(actual) * 100 + 0.5)
        result = forecast(item, data["months"], data["as_of"], 12)
        assert (result["stock"], result["monthly_demand"], result["runout_month"], result["error_percent"]) == (stock, demand, runout, error)
        assert (stock, demand, runout, error) == expected[item["sku"]]


def test_backtest_thresholds_and_minimum():
    assert backtest([2] * 6)["grade"] == "Not enough history to check"
    assert backtest([10] * 7) == {"error_percent": 0, "grade": "Usable for planning"}


def test_invalid_values_hold_and_horizon_is_bounded():
    data = load_sample()
    bad = {**data["items"][0], "on_hand": -1}
    assert forecast(bad, data["months"], data["as_of"])["held"]
    import pytest
    with pytest.raises(ValueError):
        forecast(data["items"][0], data["months"], data["as_of"], 13)


def test_linear_runout_day_minus_supplier_days_and_zero_unknown():
    item = dict(sku='FAKE', name='Fake', unit='ea', on_hand=5, supplier_days=3,
                monthly_sales=[10] * 7, receipts={})
    months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    result = forecast(item, months, '2026-10-31')
    assert result['runout_day'] == '2026-11-15'
    assert result['order_by'] == '2026-11-12'
    assert forecast({**item, 'supplier_days': 0}, months, '2026-10-31')['order_by'] is None
    assert forecast({**item, 'receipts': []}, months, '2026-10-31')['held']


@pytest.mark.parametrize("sales", [[0] * 7, [10, 20, 30, 0, 0, 0, 0]])
def test_zero_recent_actual_sales_has_a_distinct_backtest_grade(sales):
    assert backtest(sales) == {"error_percent": None, "grade": "No recent sales to check"}


@pytest.mark.parametrize("supplier_days, expected", [(16, True), (15, False), (14, False), (0, False), (None, False)])
def test_order_overdue_is_true_only_before_as_of(supplier_days, expected):
    data = load_sample()
    item = {**data["items"][0], "on_hand": 5, "monthly_sales": [10] * len(data["months"]),
            "supplier_days": supplier_days, "receipts": {}}
    result = forecast(item, data["months"], data["as_of"])
    assert result["order_overdue"] is expected


def test_order_overdue_is_false_without_runout():
    data = load_sample()
    item = {**data["items"][0], "on_hand": 1000000}
    result = forecast(item, data["months"], data["as_of"])
    assert result["order_by"] is None
    assert result["order_overdue"] is False


@pytest.mark.parametrize("receipts", [None, [], "invalid", 3])
def test_non_object_receipts_hold_preserves_item_name(receipts):
    data = load_sample()
    item = {**data["items"][0], "receipts": receipts}
    assert forecast(item, data["months"], data["as_of"]) == {
        "sku": item["sku"], "name": item["name"], "held": True,
        "reason": "Receipts must be an object keyed by month.",
    }


def test_source_unit_conversion_hold_reason_prevents_forecasting():
    data = load_sample()
    reason = "Some moves use a unit that cannot be converted."
    item = {**data["items"][0], "hold_reason": reason}
    assert validate_item(item) == reason
    assert forecast(item, data["months"], data["as_of"]) == {
        "sku": item["sku"], "name": item["name"], "held": True, "reason": reason,
    }

# Seasonal-only packet, narrowed by owner: historical backtest is unchanged.
@pytest.mark.parametrize('sales,seasonal,first,second,level', [
    ([50, 150] + [100] * 10, True, 50, 150, 100),
    ([0, 1000] + [10] * 10, True, 10, 40, 20),
    ([0] * 12, True, 0, 0, 0),
    ([0.1] * 12, True, 1, 1, 0.1),
    ([10] * 11, False, 10, 10, 10),
    ([1.0000000000000002] * 3, False, 2, 2, 1.0000000000000002),
])
def test_seasonal_factors_clamp_zero_fraction_fallback(sales, seasonal, first, second, level):
    from stock_runway.engine import demand_model, month_demand
    model = demand_model(sales, '2026-12')
    assert model['seasonal'] is seasonal
    assert model['level'] == pytest.approx(level)
    assert all(0.5 <= f <= 2 for f in model['factors'])
    assert month_demand(model, '2027-01') == first
    assert month_demand(model, '2027-02') == second
    if sales == [50, 150] + [100] * 10:
        assert model['factors'] == [0.5, 1.5] + [1] * 10
    if not any(sales):
        assert model['factors'] == [1] * 12


@pytest.mark.parametrize('sales,stock,runout', [
    ([150, 50] + [100] * 10, 75, '2027-01-16'),
    ([50, 150] + [100] * 10, 75, '2027-02-05'),
])
def test_seasonal_runout_interpolates_using_crossing_month(sales, stock, runout):
    from stock_runway.engine import month_after
    months = [month_after('2026-01', i) for i in range(12)]
    item = dict(sku='SYN', name='Synthetic', unit='m', on_hand=stock, supplier_days=0,
                monthly_sales=sales, receipts={})
    result = forecast(item, months, '2026-12-31', 6)
    assert result['seasonal'] is True
    assert result['runout_day'] == runout
    assert result['monthly_demand'] == sales[0]


def test_seasonal_sample_oracle_and_fallback_explanation():
    data = load_sample()
    result = forecast(data['items'][0], data['months'], data['as_of'])
    assert [r['demand'] for r in result['projection']] == [5689, 4789, 5282, 5523, 4504, 3962]
    assert result['runout_day'] == '2027-04-01'
    item = {**data['items'][0], 'monthly_sales': [10, 20, 30]}
    short = forecast(item, data['months'][-3:], data['as_of'])
    assert short['seasonal'] is False
    assert short['forecast_explanation'] == 'Needs 12 months of sales for seasonal ups and downs'
    assert [r['demand'] for r in short['projection']] == [20] * 6

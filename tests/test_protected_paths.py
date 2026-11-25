import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("stock_runway")
package.__path__ = [str(ROOT)]
sys.modules.setdefault("stock_runway", package)

from stock_runway.sources import SourceError, load_csv

GOOD = "sku,name,unit,on_hand,supplier_days,2026-01,2026-02,2026-03\nA,Item,ea,20,5,1,2,3\n"
PROTECTED = "." + "env"  # a project-local secrets file name the host refuses


@pytest.fixture
def host_guard(monkeypatch):
    """A stand-in for the host's agent.file_safety that blocks secrets files the way the runtime does."""
    calls = []

    def get_read_block_error(path):
        calls.append(path)
        return "Access denied: host-wording" if Path(path).name == PROTECTED else None

    agent = types.ModuleType("agent")
    safety = types.ModuleType("agent.file_safety")
    safety.get_read_block_error = get_read_block_error
    agent.file_safety = safety
    monkeypatch.setitem(sys.modules, "agent", agent)
    monkeypatch.setitem(sys.modules, "agent.file_safety", safety)
    return calls


def _assert_refused(exc, *leaks):
    text = str(exc.value)
    assert "protected" in text
    for leak in leaks:
        assert leak not in text


def test_protected_file_is_refused_without_echoing_it(tmp_path, host_guard):
    secret = tmp_path / PROTECTED
    secret.write_text(GOOD.replace("Item", "SECRETVALUE"), encoding="utf-8")
    with pytest.raises(SourceError) as exc:
        load_csv(str(secret))
    _assert_refused(exc, "SECRETVALUE", str(secret), "host-wording")


def test_symlink_to_protected_file_is_refused(tmp_path, host_guard):
    secret = tmp_path / PROTECTED
    secret.write_text(GOOD, encoding="utf-8")
    link = tmp_path / "stock.csv"
    link.symlink_to(secret)
    with pytest.raises(SourceError) as exc:
        load_csv(str(link))
    _assert_refused(exc, str(secret))


def test_receipts_path_is_guarded_too(tmp_path, host_guard):
    sales = tmp_path / "sales.csv"
    sales.write_text(GOOD, encoding="utf-8")
    secret = tmp_path / PROTECTED
    secret.write_text("sku,month,quantity\nA,2026-04,4\n", encoding="utf-8")
    with pytest.raises(SourceError) as exc:
        load_csv(str(sales), str(secret))
    _assert_refused(exc, str(secret))


def test_ordinary_csv_still_loads_under_the_guard(tmp_path, host_guard):
    sales = tmp_path / "sales.csv"
    sales.write_text(GOOD, encoding="utf-8")
    assert load_csv(str(sales))
    assert host_guard


def test_blocked_link_name_is_refused_before_resolving(tmp_path, monkeypatch):
    """The literal path is checked too, not only the resolved target."""
    target = tmp_path / "plain.csv"
    target.write_text(GOOD, encoding="utf-8")
    link = tmp_path / "blocked-name.csv"
    link.symlink_to(target)
    agent = types.ModuleType("agent")
    safety = types.ModuleType("agent.file_safety")
    safety.get_read_block_error = lambda path: "no" if Path(path).name == "blocked-name.csv" else None
    monkeypatch.setitem(sys.modules, "agent", agent)
    monkeypatch.setitem(sys.modules, "agent.file_safety", safety)
    with pytest.raises(SourceError) as exc:
        load_csv(str(link))
    _assert_refused(exc)


@pytest.mark.parametrize("broken", ["import", "missing", "raises"])
def test_broken_host_guard_fails_closed(tmp_path, monkeypatch, broken):
    sales = tmp_path / "sales.csv"
    sales.write_text(GOOD, encoding="utf-8")
    agent = types.ModuleType("agent")
    safety = types.ModuleType("agent.file_safety")
    if broken == "raises":
        def get_read_block_error(path):
            raise RuntimeError("host bug")
        safety.get_read_block_error = get_read_block_error
    monkeypatch.setitem(sys.modules, "agent", agent)
    if broken == "import":
        # The host package is there but its guard fails to import (a missing dependency): not "standalone".
        host = tmp_path / "host"
        host.mkdir()
        (host / "file_safety.py").write_text("import a_dependency_that_is_missing\n", encoding="utf-8")
        agent.__path__ = [str(host)]
        monkeypatch.delitem(sys.modules, "agent.file_safety", raising=False)
    else:
        monkeypatch.setitem(sys.modules, "agent.file_safety", safety)
    with pytest.raises(SourceError) as exc:
        load_csv(str(sales))
    _assert_refused(exc, "host bug")


def test_standalone_without_host_reads_normally(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "agent", None)
    monkeypatch.delitem(sys.modules, "agent.file_safety", raising=False)
    sales = tmp_path / "sales.csv"
    sales.write_text(GOOD, encoding="utf-8")
    assert load_csv(str(sales))

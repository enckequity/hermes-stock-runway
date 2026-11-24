"""Chat results are plain text only: no transcript card directive reaches surfaces that cannot render it."""
import json
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("stock_runway")
package.__path__ = [str(ROOT)]
sys.modules.setdefault("stock_runway", package)

from stock_runway import tools


def test_result_has_summary_and_no_card_directive():
    text = tools.make_handler()({})
    payload = json.loads(text)
    assert payload["summary"] and payload["disclosure"]
    assert "card" not in payload
    assert "::stock-runway" not in text


def test_errors_do_not_emit_a_card():
    payload = json.loads(tools.make_handler()({"horizon": 0}))
    assert "error" in payload and "card" not in payload


def test_tool_and_skill_do_not_ask_for_a_card():
    description = tools.TOOL_SCHEMA["description"]
    skill = (ROOT / "skills" / "stock-runway" / "SKILL.md").read_text()
    for text in (description, skill):
        assert "card" not in text and "verbatim" not in text and "Hermes" not in text

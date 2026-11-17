import csv
import json
from pathlib import Path

import pytest

from translog.config import Settings
from translog.orders import CsvOrderRepository, SourceError, consult_order


SAMPLE = Path(__file__).parents[1] / "data/samples/orders.csv"


def repository(path=SAMPLE, **kwargs):
    return CsvOrderRepository(path, origin="sample", **kwargs)


def test_delay_and_source_are_observed_not_a_live_location():
    result = consult_order(repository(), "1001")
    assert result["status"] == "found"
    assert result["items"][0]["delay_days"] == 2
    assert result["source"]["origin"] == "sample"
    assert result["source"]["is_simulated"] is True
    assert "snapshot_generated_at" in result["source"]
    assert "latitude" not in result["items"][0]


@pytest.mark.parametrize("code,delay", [("1002", 0), ("1003", 0)])
def test_on_time_and_early_are_not_delayed(code, delay):
    assert consult_order(repository(), code)["items"][0]["delay_days"] == delay


def test_all_order_items_and_leading_zeroes_are_preserved():
    assert len(consult_order(repository(), "1004")["items"]) == 2
    assert consult_order(repository(), "0007")["order_id"] == "0007"


def test_missing_days_remain_unknown():
    item = consult_order(repository(), "1005")["items"][0]
    assert item["actual_days"] is None
    assert item["delay_days"] is None
    assert item["delivery_status"] is None


def test_missing_order_and_invalid_input_do_not_mutate_source():
    before = SAMPLE.read_bytes()
    assert consult_order(repository(), "9999")["status"] == "not_found"
    for value in ["", "1 OR 1=1", "../../.env", "' DROP TABLE pedidos", None]:
        assert consult_order(repository(), value)["status"] == "invalid_input"
    assert before == SAMPLE.read_bytes()


def test_missing_or_invalid_source_does_not_look_like_a_missing_order(tmp_path):
    assert consult_order(repository(tmp_path / "missing.csv"), "1001")["status"] == "unavailable"
    invalid = tmp_path / "invalid.csv"
    invalid.write_text("order_id,order_item_id,actual_days\n1,1,-1\n", encoding="utf-8")
    assert consult_order(repository(invalid), "1")["status"] == "unavailable"


def test_duplicate_item_keys_are_rejected(tmp_path):
    duplicate = tmp_path / "duplicate.csv"
    duplicate.write_text("order_id,order_item_id\n1,2\n1,2\n", encoding="utf-8")
    with pytest.raises(SourceError, match="duplicad"):
        repository(duplicate).read_items()


def test_canonical_mapping_and_encoding_select_only_allowed_fields(tmp_path):
    silver = tmp_path / "silver.csv"
    silver.write_text("Pedido;Item;Dias;Cliente\n0009;1;3.0;João\n", encoding="latin-1")
    repo = CsvOrderRepository(silver, origin="silver", encoding="latin-1", delimiter=";",
                              column_map={"order_id": "Pedido", "order_item_id": "Item", "actual_days": "Dias"})
    result = consult_order(repo, "0009")
    assert result["items"][0]["actual_days"] == 3
    assert "Cliente" not in json.dumps(result)
    assert "João" not in json.dumps(result, ensure_ascii=False)
    assert result["source"]["is_simulated"] is False


def test_sql_pending_never_silently_uses_the_sample(monkeypatch):
    from translog.tools import consultar_pedido
    monkeypatch.setenv("TRANSLOG_ORDER_BACKEND", "sql_pending")
    assert consultar_pedido("1001")["status"] == "unavailable"


def test_invalid_encoding_stays_inside_tool_contract(monkeypatch):
    from translog.tools import consultar_pedido
    monkeypatch.setenv("TRANSLOG_ORDER_BACKEND", "csv")
    monkeypatch.setenv("TRANSLOG_CSV_ENCODING", "utf-999-typo")
    result = consultar_pedido("1001")
    assert result["status"] == "unavailable"
    assert "utf-999-typo" not in str(result)

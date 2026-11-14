import json

import pytest

from translog.cli import main
from translog.client import extract_final_text


def test_doctor_does_not_print_key(monkeypatch, capsys):
    monkeypatch.setenv("GOOGLE_API_KEY", "unit-test-secret-not-a-real-key")
    assert main(["doctor"]) == 0
    result = capsys.readouterr().out
    assert "unit-test-secret-not-a-real-key" not in result
    assert json.loads(result)["api_key_configured"] is True


def test_cli_queries_sample_without_model(monkeypatch, capsys):
    monkeypatch.setenv("TRANSLOG_ORDER_BACKEND", "csv")
    monkeypatch.setenv("TRANSLOG_ORDERS_CSV", "data/samples/orders.csv")
    monkeypatch.setenv("TRANSLOG_DATA_ORIGIN", "sample")
    assert main(["order", "1001"]) == 0
    assert json.loads(capsys.readouterr().out)["items"][0]["delay_days"] == 2


def test_cli_validation_failure_is_explicit(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("TRANSLOG_ORDERS_CSV", str(tmp_path / "missing.csv"))
    assert main(["validate-orders"]) == 1
    assert json.loads(capsys.readouterr().out)["status"] == "error"


def test_portal_extracts_only_final_text_not_tools_or_thoughts():
    events = [
        {"content": {"role": "model", "parts": [{"text": "Vou consultar."}]}},
        {"content": {"role": "model", "parts": [{"functionCall": {"name": "consultar_pedido"}}]}},
        {"content": {"role": "user", "parts": [{"functionResponse": {"name": "consultar_pedido"}}]}},
        {"content": {"role": "model", "parts": [{"text": "raciocínio privado", "thought": True}, {"text": "Atraso observado de dois dias."}]}},
    ]
    assert extract_final_text(events) == "Atraso observado de dois dias."


def test_portal_does_not_turn_model_error_into_previous_intermediate_text():
    events = [{"content": {"role": "model", "parts": [{"text": "Vou consultar."}]}},
              {"errorCode": "RESOURCE_EXHAUSTED", "errorMessage": "private-details"}]
    with pytest.raises(ValueError, match="indisponível"):
        extract_final_text(events)


def test_portal_rejects_nonfinal_tool_only_response():
    with pytest.raises(ValueError):
        extract_final_text([{"content": {"role": "user", "parts": [{"text": "1001"}]}}])


def test_portal_rejects_intermediate_text_when_tool_never_finishes():
    events = [
        {"content": {"role": "model", "parts": [{"text": "Vou consultar."}]}},
        {"content": {"role": "model", "parts": [{"functionCall": {"name": "consultar_pedido"}}]}},
        {"content": {"role": "user", "parts": [{"functionResponse": {"name": "consultar_pedido"}}]}},
    ]
    with pytest.raises(ValueError):
        extract_final_text(events)


@pytest.mark.parametrize("flag", ["partial", "interrupted"])
def test_portal_rejects_partial_or_interrupted_output(flag):
    with pytest.raises(ValueError):
        extract_final_text([{flag: True, "content": {"role": "model", "parts": [{"text": "Resposta incompleta"}]}}])

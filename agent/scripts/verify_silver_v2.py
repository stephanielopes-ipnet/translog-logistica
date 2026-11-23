"""Aceite local de casos da exportação de 17/11 e recuperação real, sem LLM."""

import json
import time
from pathlib import Path

from translog.config import Settings
from translog.knowledge import KnowledgeStore
from translog.tools import consultar_pedido


def verify():
    settings = Settings.from_env()
    if settings.backend != "csv_v2":
        raise ValueError("Este aceite exige backend csv_v2 explícito.")
    expected = {"1": "Extraviado", "2": "Não pago (expirado)", "4": "Entregue com atraso", "7": "Entregue no prazo",
                "12": "Entregue no prazo", "50": "Cancelado", "76380": "Em trânsito", "77132": "Aguardando pagamento", "1001": "Entregue no prazo"}
    report = {"backend": settings.backend, "orders": [], "retrieval": [], "generative_model_called": False}
    for code, status in expected.items():
        start = time.monotonic()
        result = consultar_pedido(code)
        assert result["status"] == "found", code
        order = result["order"]
        assert order["order_status"] == status, code
        if code in {"2", "50", "77132"}:
            assert order["dispatch"]["signed_delay_days"] is None
            assert order["delivery"]["delay_days"] is None
        if code == "1":
            assert order["dispatch"]["signed_delay_days"] == -2
        if code == "7":
            assert order["dispatch"]["signed_delay_days"] == 1
            assert order["delivery"]["delay_days"] == 0
        if code == "12":
            assert order["delivery"]["delay_days"] == -1
        if code == "1001":
            assert len(result["items"]) == 4
            assert order["delivery"]["recorded_date"] == "2015-01-22"
        assert result["source"]["is_simulated"] and result["source"]["is_historical"]
        report["orders"].append({"id": code, "status": status, "items": len(result["items"]),
                                 "events": len(result["events"]), "seconds": round(time.monotonic() - start, 3)})
    assert consultar_pedido("999999999")["status"] == "not_found"
    store = KnowledgeStore(settings.knowledge_dir, model_cache=settings.model_cache)
    cases = [("O prazo de despacho é o prazo de entrega?", "tecnico-prazos-despacho"),
             ("Posso alterar o endereço de entrega?", "tecnico-alteracao-endereco"),
             ("Quais dados pessoais preciso informar para consultar meu pedido?", "tecnico-dados-pessoais"),
             ("Existe indenização automática por atraso?", "tecnico-cancelamento-reembolso")]
    for question, expected_id in cases:
        result = store.search(question)
        assert result["status"] == "retrieved", question
        identifiers = [passage["id"] for passage in result["passages"]]
        assert expected_id in identifiers, (question, identifiers)
        report["retrieval"].append({"question": question, "ids": identifiers, "expected_in_top3": True})
    return report


if __name__ == "__main__":
    report = verify()
    target = Path(".state/acceptance-silver-v2-2026-11-17.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

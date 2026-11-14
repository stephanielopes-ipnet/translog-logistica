"""Consulta CSV para desenvolvimento. Não representa um conector SQL."""

import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
import re
from typing import Protocol


FIELDS = ("order_id", "order_item_id", "order_status", "delivery_status",
          "scheduled_days", "actual_days", "shipping_mode", "destination_region")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
NULLS = {"", "null", "none", "nan", "n/a"}


class SourceError(ValueError):
    """Fonte inválida ou indisponível."""


class OrderRepository(Protocol):
    def read_items(self) -> list[dict]: ...
    def source(self) -> dict: ...


def _text(value):
    if value is None:
        return None
    value = value.strip()
    return None if value.lower() in NULLS else value


def _days(value):
    value = _text(value)
    if value is None:
        return None
    try:
        number = Decimal(value)
        if not number.is_finite() or number < 0 or number != number.to_integral_value():
            raise ValueError
        return int(number)
    except (InvalidOperation, ValueError, OverflowError) as exc:
        raise SourceError("Duração inválida: esperado inteiro não negativo ou nulo.") from exc


class CsvOrderRepository:
    def __init__(self, path: Path, origin="sample", encoding="utf-8-sig", delimiter=",", column_map=None):
        self.path = Path(path)
        self.origin = origin
        self.encoding = encoding
        self.delimiter = delimiter
        self.column_map = column_map or {}
        if set(self.column_map) - set(FIELDS):
            raise SourceError("O mapa contém campos canônicos desconhecidos.")

    def read_items(self):
        items, seen = [], set()
        try:
            with self.path.open(encoding=self.encoding, newline="") as stream:
                reader = csv.DictReader(stream, delimiter=self.delimiter)
                headers = reader.fieldnames or []
                if len(headers) != len(set(headers)):
                    raise SourceError("Cabeçalhos duplicados no CSV.")
                if any(self.column_map.get(key, key) not in headers for key in ("order_id", "order_item_id")):
                    raise SourceError("CSV precisa de código do pedido e identificador do item.")
                for row in reader:
                    if None in row:
                        raise SourceError("Linha CSV contém quantidade inesperada de campos.")
                    item = {key: _text(row.get(self.column_map.get(key, key))) for key in FIELDS}
                    for key in ("order_id", "order_item_id"):
                        if not item[key] or not IDENTIFIER.fullmatch(item[key]):
                            raise SourceError("Identificador inválido na fonte.")
                    pair = (item["order_id"], item["order_item_id"])
                    if pair in seen:
                        raise SourceError("Chave de pedido/item duplicada.")
                    seen.add(pair)
                    for key in ("scheduled_days", "actual_days"):
                        item[key] = _days(item[key])
                    actual, scheduled = item["actual_days"], item["scheduled_days"]
                    item["delay_days"] = max(actual - scheduled, 0) if actual is not None and scheduled is not None else None
                    items.append(item)
        except (OSError, UnicodeError, LookupError, csv.Error) as exc:
            raise SourceError("Não foi possível ler a fonte CSV configurada.") from exc
        return items

    def source(self):
        return {
            "backend": "csv",
            "origin": self.origin,
            "is_simulated": self.origin == "sample",
            "is_historical": True,
            "snapshot_generated_at": datetime.fromtimestamp(self.path.stat().st_mtime, timezone.utc).isoformat(),
            "note": "Data do arquivo exportado; não é uma localização ao vivo nem data de entrega.",
        }


class PendingSqlRepository:
    def read_items(self):
        raise SourceError("Banco definitivo pendente: configurar conector após decisão do grupo.")

    def source(self):
        return {"backend": "sql_pending"}


def consult_order(repository: OrderRepository, order_id: str):
    if not isinstance(order_id, str) or not IDENTIFIER.fullmatch(order_id.strip()):
        return {"status": "invalid_input", "message": "Informe um código de pedido válido, sem comandos ou espaços internos."}
    code = order_id.strip()
    try:
        # Valida toda a exportação antes de responder, evitando resultados de fonte parcialmente inválida.
        items = [item for item in repository.read_items() if item["order_id"] == code]
        source = repository.source()
    except (SourceError, OSError):
        return {"status": "unavailable", "message": "Fonte de pedidos indisponível ou inválida. Conferir configuração com a equipe; não é possível afirmar o status."}
    return {"status": "found" if items else "not_found", "order_id": code,
            "items": items, "source": source,
            "message": "Registros consultados." if items else "Pedido não encontrado nesta fonte."}

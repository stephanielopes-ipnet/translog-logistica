"""Leitura explícita das tabelas de consumo v2; não é um conector SQL."""

import csv
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from threading import Lock

from .orders import IDENTIFIER, SourceError, _text


ORDER_MAP = {
    "order_status": "situacao_pedido", "ordered_at": "data_pedido", "reference_date": "data_referencia_base",
    "shipping_mode": "modo_envio", "transport_mode": "modal_transporte", "route_type": "tipo_rota",
    "destination_country": "destino_pais", "destination_state": "destino_estado",
    "destination_city": "destino_cidade", "destination_region": "destino_regiao",
    "stage": "etapa_atual_desc", "location": "local_atual", "last_event": "ultimo_evento_desc",
    "last_event_at": "ts_ultimo_evento", "loss_stage": "etapa_extravio",
}
DISPATCH_MAP = {"scheduled_days": "prazo_despacho_dias", "actual_days": "dias_ate_despacho",
                "planned_date": "data_despacho_prevista", "recorded_date": "data_despacho_real",
                "status": "status_prazo_despacho", "is_late": "flag_atraso_despacho",
                "signed_delay_days": "dias_atraso_despacho", "reported_cause": "causa_atraso_despacho"}
DELIVERY_MAP = {"planned_date": "data_entrega_prevista", "recorded_date": "data_entrega_realizada",
                "is_late": "flag_atraso_entrega", "delay_days": "dias_atraso_entrega",
                "reported_cause": "causa_atraso_entrega"}
ITEM_MAP = {"order_id": "id_pedido", "order_item_id": "id_item_pedido", "product_name": "nome_produto",
            "quantity": "quantidade_item"}
EVENT_MAP = {"sequence": "sequencia", "code": "codigo_evento", "description": "descricao_evento",
             "stage": "etapa_desc", "occurred_at": "ts_evento", "location": "local_evento", "is_last": "ultimo_evento"}

ORDER_COLUMNS = ("qtd_itens", *ORDER_MAP.values(), *DISPATCH_MAP.values(), *DELIVERY_MAP.values())
ITEM_COLUMNS = tuple(ITEM_MAP.values())
EVENT_COLUMNS = tuple(EVENT_MAP.values())


def _integer(value, signed=False):
    value = _text(value)
    if value is None:
        return None
    try:
        number = Decimal(value)
        if not number.is_finite() or number != number.to_integral_value() or (not signed and number < 0):
            raise ValueError
        return int(number)
    except (ValueError, InvalidOperation, OverflowError) as exc:
        raise SourceError("Número inválido na exportação de consumo.") from exc


def _boolean(value):
    value = _text(value)
    if value is None:
        return None
    if value.lower() in {"true", "1"}:
        return True
    if value.lower() in {"false", "0"}:
        return False
    raise SourceError("Indicador inválido na exportação de consumo.")


def _mapped(row, mapping):
    return {key: _text(row[column]) for key, column in mapping.items()}


class ConsumptionCsvRepository:
    def __init__(self, directory: Path, encoding="utf-8-sig", delimiter=","):
        self.directory = Path(directory)
        self.encoding, self.delimiter = encoding, delimiter
        self.paths = [self.directory / f"consumo_{name}.csv" for name in ("pedidos", "itens_pedido", "eventos_logisticos")]
        self._lock = Lock()
        self._indexed_fingerprint = None
        self._index = None

    def _index_table(self, path, columns):
        by_order = defaultdict(list)
        try:
            with path.open(encoding=self.encoding, newline="") as stream:
                reader = csv.reader(stream, delimiter=self.delimiter)
                headers = next(reader, [])
                required = {"id_pedido", *columns}
                if len(headers) != len(set(headers)) or not set(required).issubset(headers):
                    raise SourceError("Cabeçalho incompatível com consumo v2.")
                order_column = headers.index("id_pedido")
                positions = [headers.index(column) for column in columns]
                for row in reader:
                    if not row:
                        continue
                    if len(row) != len(headers):
                        raise SourceError("Linha incompleta na exportação de consumo.")
                    by_order[_text(row[order_column])].append(tuple(row[i] for i in positions))
        except (OSError, UnicodeError, LookupError, csv.Error) as exc:
            raise SourceError("Não foi possível ler as tabelas de consumo.") from exc
        return by_order

    def _fingerprint(self):
        stats = [path.stat() for path in self.paths]
        return [(st.st_size, st.st_mtime_ns, st.st_ino, st.st_dev) for st in stats]

    def _snapshot(self):
        with self._lock:
            before = self._fingerprint()
            if self._index is None or before != self._indexed_fingerprint:
                columns = (ORDER_COLUMNS, ITEM_COLUMNS, EVENT_COLUMNS)
                index = tuple(self._index_table(path, fields) for path, fields in zip(self.paths, columns))
                if before != self._fingerprint():
                    raise SourceError("Exportação mudou durante a leitura; repetir após a carga.")
                self._index = index
                self._indexed_fingerprint = before
            return self._index

    def read_order(self, code):
        order_index, item_index, event_index = self._snapshot()
        rows = order_index.get(code, ())
        items = [_mapped(dict(zip(ITEM_COLUMNS, row)), ITEM_MAP) for row in item_index.get(code, ())]
        events = [_mapped(dict(zip(EVENT_COLUMNS, row)), EVENT_MAP) for row in event_index.get(code, ())]
        if len(rows) > 1:
            raise SourceError("Pedido duplicado na tabela de consumo.")
        if not rows:
            if items or events:
                raise SourceError("Registros sem pedido correspondente.")
            return {"order": None, "items": [], "events": []}
        if not items or not events:
            raise SourceError("Pedido sem itens ou eventos na exportação.")
        row = dict(zip(ORDER_COLUMNS, rows[0]))
        order = _mapped(row, ORDER_MAP)
        try:
            reference = date.fromisoformat(order["reference_date"])
        except (ValueError, TypeError) as exc:
            raise SourceError("Data de referência inválida.") from exc
        for key, mapping in (("dispatch", DISPATCH_MAP), ("delivery", DELIVERY_MAP)):
            values = _mapped(row, mapping)
            for number in {"scheduled_days", "actual_days", "signed_delay_days", "delay_days"} & values.keys():
                values[number] = _integer(values[number], signed=number in {"signed_delay_days", "delay_days"})
            values["is_late"] = _boolean(values["is_late"])
            for field in ("planned_date", "recorded_date"):
                if values[field]:
                    try:
                        parsed = date.fromisoformat(values[field])
                    except ValueError as exc:
                        raise SourceError("Data inválida.") from exc
                    if field == "recorded_date" and parsed > reference:
                        raise SourceError("Evento ocorrido após a referência histórica.")
            order[key] = values
        identifiers = set()
        for item in items:
            identifier = item["order_item_id"]
            if not identifier or not IDENTIFIER.fullmatch(identifier) or identifier in identifiers:
                raise SourceError("Identificador de item inválido ou duplicado.")
            identifiers.add(identifier)
            item["quantity"] = _integer(item["quantity"])
            if item["quantity"] is None or item["quantity"] < 1:
                raise SourceError("Quantidade de item inválida.")
        if sum(item["quantity"] for item in items) != _integer(row["qtd_itens"]):
            raise SourceError("Quantidade de unidades diverge dos itens.")
        sequences = set()
        timestamps = {}
        for event in events:
            event["sequence"] = _integer(event["sequence"])
            if not event["sequence"] or event["sequence"] in sequences:
                raise SourceError("Sequência de evento inválida ou duplicada.")
            sequences.add(event["sequence"])
            event["is_last"] = _boolean(event["is_last"])
            try:
                timestamp = datetime.fromisoformat(event["occurred_at"].replace("Z", "+00:00"))
                if timestamp.tzinfo is None or timestamp.date() > reference:
                    raise ValueError
            except (ValueError, AttributeError) as exc:
                raise SourceError("Instante do evento inválido ou futuro à referência.") from exc
            timestamps[event["sequence"]] = timestamp
        events.sort(key=lambda event: event["sequence"])
        if any(timestamps[left["sequence"]] > timestamps[right["sequence"]] for left, right in zip(events, events[1:])):
            raise SourceError("Ordem temporal dos eventos diverge da sequência.")
        if sum(event["is_last"] is True for event in events) != 1 or not events[-1]["is_last"]:
            raise SourceError("Último evento não é único ou não é o final da sequência.")
        if events[-1]["occurred_at"] != order["last_event_at"] or events[-1]["description"] != order["last_event"]:
            raise SourceError("Último evento diverge do pedido.")
        last = events[-1]
        logistics_event = last["code"] in {
            "PEDIDO_DESPACHADO", "COLETA_GATEWAY", "PARTIDA_VOO", "CHEGADA_ALFANDEGA",
            "LIBERACAO_ALFANDEGA", "CHEGADA_CD", "SAIU_PARA_ENTREGA", "ENTREGUE",
            "CHEGADA_ARMAZEM", "EXTRAVIO_CONFIRMADO",
        }
        order["tracking"] = {
            "event_kind": "logistics_event" if logistics_event else (
                "system_registration" if last["code"] == "PEDIDO_CRIADO" else "no_location_evidence"),
            "location": last["location"] if logistics_event else None,
            "note": "Local do último evento logístico no cenário histórico/simulado; não é GPS atual." if logistics_event else
                    "Não há localização física comprovada pelo último evento. Registro no sistema não situa o pacote; destino é apenas o destino.",
        }
        return {"order": order, "items": sorted(items, key=lambda item: item["order_item_id"]), "events": events}

    def source(self):
        return {"backend": "csv_v2", "origin": "silver", "version": "silver_v2-20261117",
                "is_simulated": True, "is_historical": True,
                "snapshot_generated_at": datetime.fromtimestamp(max(path.stat().st_mtime for path in self.paths), timezone.utc).isoformat(),
                "note": "Base acadêmica histórica DataCo com complemento simulado de entrega, eventos, locais, modal e ocorrências. "
                        "Proveniência registrada para auditoria; atendimento da apresentação usa as situações deste cenário. "
                        "Não é GPS nem operação real ao vivo. As datas originais são preservadas. A data do arquivo não é a do evento."}

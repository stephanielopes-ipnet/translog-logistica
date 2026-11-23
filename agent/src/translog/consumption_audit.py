"""Auditoria local das três exportações, sem modelo e sem alterar os CSVs."""

import csv
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path


def audit(directory):
    root = Path(directory)
    result = {"files": {}, "issues": Counter(), "examples": {}}
    orders, item_counts, quantities, last_events = {}, Counter(), Counter(), {}
    last_markers, event_times = Counter(), defaultdict(list)
    for name in ("consumo_pedidos.csv", "consumo_itens_pedido.csv", "consumo_eventos_logisticos.csv"):
        path = root / name
        info = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": 0}
        counters = defaultdict(Counter)
        keys = set()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            info["columns"] = reader.fieldnames
            for row in reader:
                info["rows"] += 1
                if None in row or any(v is None for v in row.values()):
                    result["issues"][name + ":malformed"] += 1
                    continue
                code = row["id_pedido"]
                if name == "consumo_pedidos.csv":
                    key = code
                    selected = ("situacao_pedido", "data_referencia_base", "data_despacho_real", "data_entrega_realizada", "data_entrega_prevista", "ts_ultimo_evento", "ultimo_evento_desc", "qtd_itens")
                    orders[code] = {k: row[k] for k in selected}
                    for field in ("situacao_pedido", "data_referencia_base", "status_prazo_despacho", "modal_transporte", "tipo_rota"):
                        counters[field][row[field]] += 1
                    situation = row["situacao_pedido"]
                    result["examples"].setdefault(situation, {k: row[k] for k in ("id_pedido", "situacao_pedido", "status_prazo_despacho", "dias_atraso_despacho", "dias_atraso_entrega", "ts_ultimo_evento")})
                    for field in ("dias_atraso_despacho", "dias_atraso_entrega"):
                        counters[field + "_null"][str(not row[field])] += 1
                        if row[field]:
                            counters[field + "_sign"]["negative" if int(row[field]) < 0 else "nonnegative"] += 1
                    for field in ("data_despacho_real", "data_entrega_realizada", "ts_ultimo_evento"):
                        if row[field] and row[field][:10] > row["data_referencia_base"][:10]:
                            result["issues"]["future_" + field] += 1
                elif name == "consumo_itens_pedido.csv":
                    key = (code, row["id_item_pedido"])
                    item_counts[code] += 1
                    quantities[code] += int(row["quantidade_item"])
                    if code not in orders:
                        result["issues"]["orphan_item"] += 1
                else:
                    key = (code, row["sequencia"])
                    counters["codigo_evento"][row["codigo_evento"]] += 1
                    counters["ultimo_evento"][row["ultimo_evento"]] += 1
                    if row["ultimo_evento"] == "true":
                        last_markers[code] += 1
                    elif row["ultimo_evento"] != "false":
                        result["issues"]["invalid_last_marker"] += 1
                    try:
                        timestamp = datetime.fromisoformat(row["ts_evento"].replace("Z", "+00:00"))
                        if timestamp.tzinfo is None:
                            raise ValueError
                        event_times[code].append((int(row["sequencia"]), timestamp))
                    except ValueError:
                        result["issues"]["invalid_event_timestamp"] += 1
                    if code not in orders:
                        result["issues"]["orphan_event"] += 1
                    else:
                        if row["ts_evento"][:10] > orders[code]["data_referencia_base"][:10]:
                            result["issues"]["future_event"] += 1
                        previous = last_events.get(code)
                        if previous is None or int(row["sequencia"]) > previous[0]:
                            last_events[code] = (int(row["sequencia"]), row["ts_evento"], row["descricao_evento"], row["ultimo_evento"])
                if key in keys:
                    result["issues"][name + ":duplicate_key"] += 1
                keys.add(key)
        info["distributions"] = dict(counters)
        result["files"][name] = info
    for code, row in orders.items():
        if last_markers[code] != 1:
            result["issues"]["last_marker_count_mismatch"] += 1
        ordered_times = sorted(event_times[code])
        if any(left[1] > right[1] for left, right in zip(ordered_times, ordered_times[1:])):
            result["issues"]["event_time_order_mismatch"] += 1
        if code not in item_counts:
            result["issues"]["order_without_items"] += 1
        if quantities[code] != int(row["qtd_itens"]):
            result["issues"]["quantity_mismatch"] += 1
        event = last_events.get(code)
        if not event:
            result["issues"]["order_without_event"] += 1
        elif event[1] != row["ts_ultimo_evento"] or event[2] != row["ultimo_evento_desc"] or event[3] != "true":
            result["issues"]["last_event_mismatch"] += 1
    result["orders_with_multiple_item_rows"] = sum(count > 1 for count in item_counts.values())
    return result

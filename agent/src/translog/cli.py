"""Comandos de aprendizagem e manutenção, sem chamadas ao modelo generativo."""

import argparse
import json
import os
from pathlib import Path
import sys

from .config import Settings
from .knowledge import KnowledgeStore
from .tools import consultar_pedido, order_repository


def main(argv=None):
    parser = argparse.ArgumentParser(description="TransLog: consulta, validação e índice de FAQ/políticas")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="Diagnóstico sem mostrar segredos")
    sub.add_parser("validate-orders", help="Valida o CSV sem enviar dados ao modelo")
    order = sub.add_parser("order", help="Consulta direta, sem LLM")
    order.add_argument("order_id")
    index = sub.add_parser("index", help="Indexa conhecimento; primeiro uso pode baixar embeddings")
    index.add_argument("--input", required=True, type=Path)
    index.add_argument("--demo", action="store_true")
    search = sub.add_parser("search", help="Recupera trechos sem LLM")
    search.add_argument("question")
    search.add_argument("--demo", action="store_true")
    args = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
        store = KnowledgeStore(settings.knowledge_dir, model_cache=settings.model_cache)
        if args.command == "doctor":
            result = {"python": sys.version.split()[0], "order_backend": settings.backend,
                      "order_file_exists": settings.orders_path.is_file(), "origin": settings.origin,
                      "model": settings.model, "api_key_configured": bool(os.getenv("GOOGLE_API_KEY", "").strip()),
                      "knowledge_mode": "demo" if settings.allow_demo else "approved",
                      "knowledge_index_exists": store._pointer(settings.allow_demo).is_file(),
                      "sql_status": "Pendente de decisão do grupo; CSV não é integração SQL."}
        elif args.command == "order":
            result = consultar_pedido(args.order_id)
        elif args.command == "validate-orders":
            repo = order_repository(settings)
            items = repo.read_items()
            result = {"status": "valid", "items": len(items), "orders": len({row["order_id"] for row in items}), "source": repo.source()}
        elif args.command == "index":
            result = store.index(args.input, demo=args.demo)
        else:
            result = store.search(args.question, demo=args.demo)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get("status") in {"invalid_input", "unavailable"} else 0
    except Exception as exc:
        # Diagnóstico legível; nunca imprime configuração/chave ou dump do CSV.
        print(json.dumps({"status": "error", "message": f"Falha em {args.command}: {type(exc).__name__}. Conferir fonte, dependências e guia."}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

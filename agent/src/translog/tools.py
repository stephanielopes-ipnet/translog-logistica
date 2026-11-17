"""Fronteiras das ferramentas: dados mínimos e falhas explícitas."""

from .config import Settings
from .knowledge import KnowledgeStore
from .orders import CsvOrderRepository, PendingSqlRepository, consult_order


def order_repository(settings):
    if settings.backend == "sql_pending":
        return PendingSqlRepository()
    return CsvOrderRepository(settings.orders_path, origin=settings.origin, encoding=settings.encoding,
                              delimiter=settings.delimiter, column_map=settings.column_map)


def consultar_pedido(order_id: str) -> dict:
    """Consulta todos os itens de um pedido; use antes de afirmar status, prazo ou atraso.

    Args:
        order_id: Código exato do pedido informado pelo usuário, preservando zeros à esquerda.
    """
    try:
        return consult_order(order_repository(Settings.from_env()), order_id)
    except (ValueError, OSError):
        return {"status": "unavailable", "message": "Configuração da consulta indisponível; não é possível afirmar o status do pedido."}


def buscar_faq_e_politicas(pergunta: str) -> dict:
    """Recupera trechos de FAQ e políticas; não confirma fatos de um pedido nem realiza alterações.

    Args:
        pergunta: Pergunta sobre procedimentos, orientações ou regras de entrega.
    """
    try:
        settings = Settings.from_env()
        return KnowledgeStore(settings.knowledge_dir, model_cache=settings.model_cache).search(pergunta, demo=settings.allow_demo)
    except (ValueError, OSError):
        return {"status": "unavailable", "message": "Configuração do conhecimento indisponível; não invente uma política."}

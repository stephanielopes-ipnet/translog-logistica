"""Exemplo mínimo de adaptação dos eventos ADK para o portal."""


def extract_final_text(events: list[dict]) -> str:
    if not isinstance(events, list):
        raise ValueError("Resposta inesperada do chat.")
    if any(event.get("errorCode") or event.get("error_code") for event in events):
        raise ValueError("Modelo indisponível; não há resposta final confirmada.")
    for event in reversed(events):
        content = event.get("content") or {}
        if not content:
            continue
        if content.get("role") != "model" or event.get("partial") or event.get("interrupted"):
            raise ValueError("O agente não concluiu uma resposta final.")
        parts = content.get("parts") or []
        if any(part.get("functionCall") or part.get("function_call") or part.get("functionResponse") for part in parts):
            raise ValueError("O agente ainda não concluiu as ferramentas.")
        texts = [part["text"] for part in parts if isinstance(part.get("text"), str) and not part.get("thought")]
        if texts:
            return "\n".join(texts)
        raise ValueError("O último evento não contém resposta final pública.")
    raise ValueError("O agente não devolveu uma resposta textual final.")

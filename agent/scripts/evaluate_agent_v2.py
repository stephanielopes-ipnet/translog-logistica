"""Duas conversas reais de aceite; usa o modelo/chave locais, sem imprimir segredos."""

import asyncio
import json
from pathlib import Path
import uuid

from google.adk.agents.run_config import RunConfig
from google.adk.runners import InMemoryRunner
from google.genai import types

from translog.agent_factory import create_agent
from translog.config import Settings


async def evaluate():
    settings = Settings.from_env()
    if settings.backend != "csv_v2":
        raise ValueError("Aceite exige csv_v2 explícito.")
    runner = InMemoryRunner(agent=create_agent(), app_name="translog_agent")
    report = {"model": settings.model, "backend": settings.backend, "cases": []}
    questions = ["Onde está meu pedido 1001?",
                 "O prazo de despacho do pedido 12 é o prazo de entrega? Como posso alterar o endereço?"]
    for question in questions:
        session = uuid.uuid4().hex
        await runner.session_service.create_session(app_name="translog_agent", user_id="local-acceptance", session_id=session)
        case = {"question": question, "tools": [], "answer": ""}

        async def consume():
            async for event in runner.run_async(user_id="local-acceptance", session_id=session,
                                                new_message=types.Content(role="user", parts=[types.Part(text=question)]),
                                                run_config=RunConfig(max_llm_calls=4)):
                if event.error_code:
                    case["error_code"] = event.error_code
                for part in (event.content.parts if event.content else []) or []:
                    if part.function_call:
                        case["tools"].append(part.function_call.name)
                    if event.is_final_response() and part.text and not part.thought:
                        case["answer"] += part.text
        try:
            await asyncio.wait_for(consume(), timeout=45)
        except Exception as exc:
            case["error_type"] = type(exc).__name__
            code = getattr(exc, "code", None)
            if isinstance(code, (int, str)):
                case["error_code"] = code
        report["cases"].append(case)
        print(json.dumps(case, ensure_ascii=False), flush=True)
        if not case["answer"]:
            break
    target = Path(".state/evaluation-gemini-v2-2026-11-17.json")
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(evaluate())

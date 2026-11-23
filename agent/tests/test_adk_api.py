"""API ADK real e ferramenta real; somente o LLM é determinístico de teste."""

import json
from pathlib import Path
import re

from fastapi.testclient import TestClient
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.cli.utils.base_agent_loader import BaseAgentLoader
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types
import pytest

from translog.agent_factory import create_agent
from translog.client import extract_final_text


class DeterministicModel(BaseLlm):
    model: str = "test-only-model-no-network"

    async def generate_content_async(self, llm_request, stream=False):
        last = llm_request.contents[-1]
        responses = [part.function_response for part in (last.parts or []) if part.function_response]
        if responses:
            text = "MODELO SIMULADO DE TESTE: " + json.dumps(responses[-1].response, ensure_ascii=False)
            content = types.Content(role="model", parts=[types.Part(text=text)])
        else:
            text = " ".join(part.text or "" for part in (last.parts or []))
            match = re.search(r"\b\d+\b", text)
            if not match:
                content = types.Content(role="model", parts=[types.Part(text="Qual é o código do pedido?")])
            else:
                content = types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name="consultar_pedido", args={"order_id": match.group()}))])
        yield LlmResponse(content=content)


class SingleAgentLoader(BaseAgentLoader):
    def __init__(self):
        self.agent = create_agent(model=DeterministicModel())

    def load_agent(self, agent_name):
        if agent_name != "translog_agent":
            raise ValueError("Agente inexistente")
        return self.agent

    def list_agents(self):
        return ["translog_agent"]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setenv("TRANSLOG_ORDER_BACKEND", "csv")
    monkeypatch.setenv("TRANSLOG_ORDERS_CSV", "data/samples/orders.csv")
    monkeypatch.setenv("TRANSLOG_DATA_ORIGIN", "sample")
    app = get_fast_api_app(agents_dir=str(Path(__file__).parents[1] / "agents"),
                          agent_loader=SingleAgentLoader(), web=False, use_local_storage=False)
    with TestClient(app) as test_client:
        yield test_client


def send(client, session, text):
    return client.post("/run", json={"appName": "translog_agent", "userId": "demo-user", "sessionId": session,
                                    "newMessage": {"role": "user", "parts": [{"text": text}]}})


def test_native_api_executes_real_order_tool_without_external_llm(client):
    response = client.post("/apps/translog_agent/users/demo-user/sessions/test-1", json={})
    assert response.status_code == 200
    response = send(client, "test-1", "Qual o status do pedido 1001?")
    assert response.status_code == 200
    events = response.json()
    tool_results = [part["functionResponse"]["response"] for event in events
                    for part in (event.get("content") or {}).get("parts", []) if part.get("functionResponse")]
    assert tool_results[0]["status"] == "found"
    assert tool_results[0]["items"][0]["delay_days"] == 2
    assert "1001" in extract_final_text(events)
    assert "MODELO SIMULADO" in extract_final_text(events)


def test_conversations_do_not_share_history(client):
    for session, code in [("conversation-a", "1001"), ("conversation-b", "1002")]:
        assert client.post(f"/apps/translog_agent/users/demo-user/sessions/{session}", json={}).status_code == 200
        assert send(client, session, "Consulte " + code).status_code == 200
    history = client.get("/apps/translog_agent/users/demo-user/sessions/conversation-b").json()
    assert "1001" not in json.dumps(history)
    assert "1002" in json.dumps(history)

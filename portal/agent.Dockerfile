# syntax=docker/dockerfile:1

# Agente de IA do Marco (Google ADK 2.14.1, Python 3.12) para o portal, a partir do código
# oficial de agent/ (que não é alterado). Contexto de build: pasta agent/.
#   docker build -f agent.Dockerfile -t translog-agent ../agent
# Normalmente sobe pelo docker-compose.agente.yml (ou "pnpm agent:up").
#
# A chave do Gemini e os CSVs chegam em tempo de execução (ver o compose). O índice e
# os embeddings da FAQ são gerados na imagem, sem usar .state/ ou .cache/ do host.

FROM python:3.12.16-slim-trixie

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/src \
    TRANSLOG_KNOWLEDGE_DIR=/app/.state/chroma \
    TRANSLOG_MODEL_CACHE=/app/.cache/models

WORKDIR /app

# O msvc_runtime do lock não tem marcador de Windows e quebra no Linux: é filtrado aqui,
# sem mudar o requirements.lock do Marco.
COPY requirements.lock ./
RUN grep -viE '^msvc[_-]runtime==' requirements.lock > /tmp/requirements.linux.txt \
 && pip install --no-cache-dir -r /tmp/requirements.linux.txt \
 && rm /tmp/requirements.linux.txt

COPY pyproject.toml ./
COPY src/ src/
COPY agents/ agents/
COPY knowledge/approved/ knowledge/approved/

RUN useradd --create-home --uid 10001 agente \
 && install -d -o agente -g agente /app/.state /app/.cache
USER agente

# O build baixa o modelo de embeddings. A busca abaixo verifica que a imagem
# consegue recuperar a FAQ como o usuário do serviço, mesmo sem baixar nada.
RUN python -m translog.cli index --input knowledge/approved
RUN --network=none python - <<'PY'
from translog.tools import buscar_faq_e_politicas

resultado = buscar_faq_e_politicas("Como funciona a central de atendimento?")
assert resultado["status"] == "retrieved", resultado["status"]
assert any(trecho["id"] == "faq-central-horarios" for trecho in resultado["passages"])
PY

EXPOSE 8001

# Sem GOOGLE_API_KEY o ADK subiria normalmente e só falharia na primeira pergunta (HTTP 500).
# Para não parecer "funcionando", o container encerra logo com uma mensagem clara.
# Sessões em memória (--no_use_local_storage): reiniciar apaga as conversas; o portal recria.
CMD ["sh", "-c", "if [ -z \"${GOOGLE_API_KEY:-}\" ]; then echo 'ERRO: falta GOOGLE_API_KEY em agent/.env (copie agent/.env.example para agent/.env e preencha a chave). O agente nao foi iniciado.' >&2; exit 1; fi; exec adk api_server agents --host 0.0.0.0 --port 8001 --no_use_local_storage"]

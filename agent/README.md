# Assistente TransLog

Agente Google ADK para consultar pedidos e buscar FAQ e políticas.

## Estado atual

- Consulta disponível com amostra fictícia e histórica.
- Não oferece GPS ao vivo nem causas de atraso comprovadas.
- Banco definitivo e adaptação à Silver aguardam alinhamento do grupo.
- FAQ e políticas oficiais aguardam conteúdo revisado; exemplos demo não são regras oficiais.

## Preparação no Windows

Requisito: Python 3.12 com o comando `py` disponível.
Execute os comandos desta documentação dentro da pasta `agent`.

Preparar o ambiente:
    .\scripts\setup.ps1

Configure sua chave privadamente na `.env`, criada pelo script.
Nunca publique esse arquivo. Confira também o modelo em `GEMINI_MODEL`.

## Verificação

    .\.venv\Scripts\python.exe -m translog.cli doctor
    .\.venv\Scripts\python.exe -m translog.cli order 1001
    .\.venv\Scripts\python.exe -m pytest -q

Os testes automatizados não fazem chamadas ao Gemini.

## Interface de desenvolvimento

    .\.venv\Scripts\adk.exe web agents --port 8001 --no_use_local_storage

Abra http://127.0.0.1:8001 e selecione `translog_agent`.
As conversas ficam em memória e são perdidas ao reiniciar o servidor.
A integração com o portal ainda precisa ser validada.

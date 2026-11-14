# Assistente TransLog

Agente Google ADK para consultar pedidos e buscar FAQ e políticas.

## Estado atual

- Consulta disponível com amostra fictícia e histórica.
- Não oferece GPS ao vivo nem causas de atraso comprovadas.
- Banco definitivo e adaptação à Silver aguardam alinhamento do grupo.
- FAQ e políticas oficiais aguardam conteúdo revisado; exemplos demo não são regras oficiais.

## Integração com o portal

- [Guia do Matheus FullStack](docs/guia-matheus-fullstack.md): instalação, configuração da chave já criada para os testes, execução e primeiro teste.
- [Contrato da API](docs/api-chat.md): sessões, mensagens HTTP, retorno em eventos e tratamento de erros.

O código está na branch `feat/agente-integracao`, no PR #30 em rascunho. O primeiro teste usa a amostra fictícia; a execução conjunta com o portal ainda precisa ser validada na máquina de Matheus.

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

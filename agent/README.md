# Assistente TransLog

Agente Google ADK com consulta estruturada de pedidos e recuperação vetorial de FAQ/orientações pelo Chroma. Projeto acadêmico, sem GPS ao vivo.

## Atualização de 17/11/2026

- Backend `csv_v2` para os três CSVs recebidos de Mateus: pedidos, itens e eventos. Despacho e entrega separados; nulos e diferenças negativas preservados.
- Histórico com complemento simulado, referência 06/02/2018. A nova base não é a amostra anterior: o pedido 1001 tem quatro linhas de itens e está entregue no prazo no cenário.
- Comunicação amigável e contexto de pedido aberto no portal preservados.
- Oito orientações técnicas revisadas localmente no Chroma. FAQ original de Stephanie é rascunho; regras comerciais pendentes continuam fora do índice ativo.
- 49 testes técnicos passaram. Duas conversas Gemini executadas sem 503; a pergunta mista omitiu citação. Instrução reforçada, ainda sem reavaliação desse reforço.
- Banco/SQL, políticas finais, contingência de 503 e demonstração completa portal → agente continuam pendentes.

## Preparação no Windows

Requisito: Python 3.12. Execute os comandos dentro de `agent`:

```powershell
.\scripts\setup.ps1
```

Configure sua chave privadamente na `.env` criada pelo script. Preserve a chave existente; nunca publique esse arquivo. O modelo padrão é `gemini-3.5-flash-lite`.

Para usar a Silver v2, obtenha os três CSVs com Mateus e coloque em `agent/data/silver/v2-2026-11-17/`. Os dados completos não fazem parte deste PR. Configure na `.env`:

```dotenv
TRANSLOG_ORDER_BACKEND=csv_v2
TRANSLOG_DATA_ORIGIN=silver
TRANSLOG_CONSUMPTION_DIR=data/silver/v2-2026-11-17
TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false
```

A `.env.example` mantém a amostra como padrão para instalação independente. Não há troca silenciosa de fonte.

## Verificação e Chroma

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli validate-orders
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli index --input knowledge/approved
.\.venv\Scripts\python.exe -m translog.cli search 'O prazo de despacho é o prazo de entrega?'
.\.venv\Scripts\python.exe -m pytest -q
```

O índice é recriado localmente. O primeiro uso de embeddings pode baixar o modelo. Testes automatizados e consulta direta não chamam Gemini; `scripts/evaluate_agent_v2.py` faz chamadas reais, sujeitas à autorização de transmissão dos dados mínimos ao Google.

## Portal e desenvolvimento

```powershell
.\.venv\Scripts\adk.exe api_server agents --host 127.0.0.1 --port 8002 --no_use_local_storage
```

Para a interface de desenvolvimento, use `adk web agents --port 8001 --no_use_local_storage`. Mantenha o terminal aberto. Reiniciar descarta sessões em memória; abra nova conversa ao trocar a fonte. O backend do portal usa sessões ADK e `POST /run`; a chave fica apenas no processo do agente.

- [Contrato e casos da Silver v2](docs/integracao-silver-v2-2026-11-17.md)
- [Guia de integração para Matheus FullStack](docs/guia-matheus-fullstack.md)
- [Contrato HTTP ADK](docs/api-chat.md)
- [Avaliação real com Gemini e limites](docs/avaliacao-gemini-v2-2026-11-17.md)
- [Estado de implementação](docs/status-implementacao.md)

Próximo aceite: portal e agente usando a mesma fonte v2 na máquina da demonstração, com status, endereço/FAQ e erro de provedor conferidos. O PR publica código/documentação e não comprova esse teste ponta a ponta.

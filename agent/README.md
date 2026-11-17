# Assistente TransLog

Agente Google ADK para consultar pedidos e oferecer atendimento em linguagem natural, com FAQ/políticas recuperadas pelo Chroma. Projeto acadêmico do grupo 3, cliente fictício.

## Começar ou retomar

- [Instruções de trabalho](AGENTS.md) e [referência canônica atual](Agentes.md).
- **[Retomar em uma nova conversa](docs/inicio-nova-conversa.md)**: estado, acordos, pastas, permissões e mensagem pronta.
- **[Casos de teste e apresentação](docs/casos-teste-e-apresentacao-agente.md)**: oito perguntas principais, cinco sequências de continuidade, perguntas adicionais e ficha de resultados.
- [Estado verificável](docs/status-implementacao.md) e [decisões](docs/decisoes.md).

## Estado em 17/11/2026

- Backend `csv_v2`: três tabelas de consumo recebidas de Mateus de Dados, com 65.752 pedidos, 180.519 itens e 350.416 eventos. Despacho e entrega separados; negativos e nulos preservados.
- Fonte do projeto já alinhada: `consumo_*` no Databricks; CSVs exportados como alternativa local, sem banco próprio. O agente local ainda não tem conexão SQL direta.
- FAQ fechada pelo grupo e conciliada: **18 trechos** em `knowledge/approved/faq-politicas-v2.json`. [Versão legível](docs/faq-v2-conciliada.md).
- Atendimento natural ao cliente no cenário da apresentação, sem repetir avisos técnicos ou rodapés de fonte/versão. Proveniência preservada nos metadados e explicada se perguntada. Datas originais não foram deslocadas; não há GPS ao vivo.
- `order.tracking` distingue registro administrativo de localização em evento logístico. Para o 16, Brasília é destino, sem localização física disponível.
- **51 testes técnicos passaram** na última suíte da implementação. Feedback manual positivo de Marco; não equivale à aprovação individual de todos os casos.
- PR de trabalho: [#32](https://github.com/stephanielopes-ipnet/translog-logistica/pull/32), branch `feat/agente-silver-v2-rag`; conferir estado remoto. Publicação da branch não significa merge na main.

## Ambiente e configuração

Python 3.12. Execute dentro da raiz desta base (pasta `agent` no repositório do grupo):

```powershell
.\scripts\setup.ps1
```

Configure a chave privadamente na `.env` ou preserve a existente. Modelo padrão: `gemini-3.5-flash-lite`. Não publicar `.env` ou copiar credenciais para o frontend.

Obtenha privadamente os três CSVs com Mateus de Dados e coloque em `data/silver/v2-2026-11-17/`. Para usar essa fonte, configure na `.env`:

```dotenv
TRANSLOG_ORDER_BACKEND=csv_v2
TRANSLOG_DATA_ORIGIN=silver
TRANSLOG_CONSUMPTION_DIR=data/silver/v2-2026-11-17
TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false
```

A `.env.example` mantém a amostra como padrão para instalação independente. O pedido 1001 da v2 é diferente do 1001 da amostra antiga: quatro linhas de itens, 14 unidades, entregue no prazo no cenário.

## Verificar e testar

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli validate-orders
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli index --input knowledge/approved
.\.venv\Scripts\python.exe -m pytest -q
```

O índice Chroma é recriado localmente; o primeiro uso pode baixar embeddings. Esses testes/consultas não chamam Gemini. O script `evaluate_agent_v2.py` faz chamadas reais e não deve ser executado automaticamente só para verificar documentação.

Instância de testes conhecida na máquina de Marco: **http://127.0.0.1:8003**, `translog_agent`. Verifique disponibilidade antes de iniciar outro processo na mesma porta. Após reiniciar o ADK, atualize a página e clique em **New Session**. Os servidores usam sessões em memória.

Para iniciar a interface se estiver parada:

```powershell
.\.venv\Scripts\adk.exe web agents --port 8003 --no_use_local_storage
```

## Integração com o portal

- [Guia de Matheus FullStack](docs/guia-matheus-fullstack.md).
- [Registro do aceite conjunto da v2](docs/aceite-portal-v2-2026-11-17.md): integração anterior relatada; teste atual ainda pendente.
- [Contrato HTTP ADK](docs/api-chat.md): sessões e `POST /run`; não existe `/chat` adicional no agente.
- [Contrato e casos da fonte v2](docs/integracao-silver-v2-2026-11-17.md).
- [Ajustes de atendimento](docs/ajuste-atendimento-apresentacao.md).

O backend do portal pode enviar `[Pedido aberto no portal: CÓDIGO]` como contexto; o agente confirma fatos com a ferramenta. `localhost` aponta para a máquina que faz a chamada. Não usar uma única sessão para clientes independentes.

Próximo aceite: portal → backend → ADK com a mesma v2/FAQ na máquina da demonstração, incluindo continuidade e erro do provedor. Contingência 503 e conexão SQL direta do agente ainda não foram implementadas. Não há garantia de disponibilidade por duas conversas sem 503.

Credenciais, CSVs privados completos, `.venv`, índices, caches e logs privados ficam fora do Git. A autorização de Marco para manter instruções e GitHub atualizados está registrada em `AGENTS.md` e `Agentes.md`.

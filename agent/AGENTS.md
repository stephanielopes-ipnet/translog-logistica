# Instruções do projeto

Leia [Agentes.md](Agentes.md) antes de alterar código ou documentação: é a referência canônica dos acordos atuais. Para retomar em outra conversa, comece por [docs/inicio-nova-conversa.md](docs/inicio-nova-conversa.md). Consulte também `docs/plano-projeto.md`, `docs/decisoes.md` e `docs/status-implementacao.md`, respeitando as datas dos registros históricos.

## Acordos atuais que não devem ser reabertos

- Fonte definida: tabelas `consumo_*` no Databricks; CSVs exportados como alternativa local, sem banco próprio. O agente local usa `csv_v2`; conexão SQL direta do agente ainda não implementada é uma questão técnica distinta.
- FAQ de Stephanie fechada pelo grupo e conciliada com a Silver v2: 18 trechos ativos. Não tratá-la novamente como aprovação pendente.
- Atendimento natural ao cliente no cenário da apresentação, sem repetir avisos técnicos sobre dataset e sem referências de FAQ/versão nas respostas normais. Preservar proveniência nos metadados e explicá-la se perguntada. Não inventar datas atuais, localização ou ações.

## Autorização de manutenção

Marco autorizou em 17/11/2026 atualizar `AGENTS.md`, `Agentes.md` e os registros de retomada sempre que necessário; manter o GitHub atualizado com commits, push e criação/atualização do PR pertinente ao andamento do projeto, sem pedir confirmação repetida para esse escopo.

Repositório único: `stephanielopes-ipnet/translog-logistica`, conta `Marco-Leal96`. Preservar trabalho dos colegas, usar a branch/PR adequados e verificar o estado remoto antes de publicar. A autorização não é motivo para incluir segredos, dados privados, alterações alheias ao projeto, force-push, merge ou deploy sem escopo específico. Manter revisão no PR; não confundir publicação da branch com merge na main.

Nunca publicar `.env`, credenciais, `.venv`, CSVs privados completos, índices ou caches. Não enviar mensagens ao grupo em nome de Marco sem solicitação. Dados e políticas do projeto acadêmico não são fatos reais da TransLog.

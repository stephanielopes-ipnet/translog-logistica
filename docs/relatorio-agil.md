# Relatório Ágil

Projeto TransLog · Academy IPNET 2026 · Grupo 3
Gestão de projetos: Stephanie Lopes · Período: 13/11 a 23/11/2026 (10 dias, 6 úteis de construção)

> **Como ler:** as dailies foram reconstruídas a partir do GitHub (commits, PRs e issues), dos registros datados em `agent/docs/` e das mensagens e reuniões do grupo. Pontos marcados com **[validar]** ainda precisam de confirmação do time.

## 1. Resumo

| Item | Situação |
|---|---|
| Objetivo | Dar visibilidade de onde e por que a TransLog atrasa e responder o cliente sem passar pela central |
| Entregas | Pipeline Medallion (Databricks), painel de diagnóstico, LogBot (ADK), portal de rastreio com Área do colaborador |
| Prazo final | Mantido: banca em 23/11 |
| Desvio de escopo | Cenário redefinido em 13–14/11 (de transportadora nacional para operadora internacional), aprovado pelo mentor em 14/11 |
| Atrasos | Gold: 1 dia (16/11 → 17/11). Dashboard v1: 1 dia (17/11 → 18/11). Absorvidos sem mover o code freeze |
| Principal achado | 57,3% dos pedidos saem atrasados do armazém. Com o prazo honesto por modalidade, o atraso cai para 31,4% |

## 2. Cronograma: planejado x realizado

| Marco | Planejado | Realizado | Desvio |
|---|---|---|---|
| Planejamento, contratos de dados e repositório | 13/11 | 13/11 | — |
| Cenário internacional aprovado pelo mentor | — | 14/11 | Mudança de contexto, sem alterar a data final |
| Silver com a regra de atraso corrigida | 16/11 | 16/11 | — |
| Gold exportada | 16/11 | 17/11 (OBT reprocessada em 19/11) | +1 dia |
| Checkpoint do MVP: agente e portal integrados | 17/11 | 17/11 (PRs #30 e #31) | — |
| Dashboard v1 | 17/11 | 18/11 | +1 dia |
| Code freeze e demo completa | 19/11 | 19/11 (PR #35) | — |
| Ensaio 1 | 21/11 | 21/11 **[validar]** | — |
| Ensaio 2 | 22/11 | 22/11 **[validar]** | — |
| Banca e entrega deste relatório | 23/11 | 23/11 | — |

## 3. Dailies

Formato: daily de 30 minutos com o time inteiro (15 de status e 15 de integração). Regra: travou por mais de 2 horas, avisa no grupo.

### D1 · sex 13/11 · Planejamento
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Repositório criado, estrutura e templates, 29 issues com dono, prazo e prioridade, Kanban com 5 marcos | Contratos de dados e respostas do Othon | — |
| Mateus | Exportação inicial da Silver para o time | Bronze e regras de atraso | — |
| Marco | Base do agente ADK local, decisão por consulta estruturada + Chroma para FAQ | Testar com a Silver recebida | Definir tratamento do atraso não avaliado |
| Matheus | Estudo do portal e protótipos | Fundação da API | — |
| Marcelo | Primeira lista de KPIs | Validar hipótese do modal | — |

Decisões: repositório único; DataCo como base; indicadores de frota fora do MVP (o dataset não tem km nem combustível).
Riscos: reunião de 13/11 levanta a troca de cenário (nacional → internacional).

### D2 · sáb 14/11 · Bronze e alinhamento do cenário
Status geral: **atenção** (mudança de contexto)

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Comunicação do novo cenário ao time; ajuste do planejamento | FAQ e políticas de atendimento | — |
| Mateus | Bronze; esclarece que atraso vazio = pagamento não processado ou cancelamento | Silver com a regra corrigida | — |
| Marco | PR #30: base ADK com amostra e testes; auditoria completa da Silver recebida | Integrar Silver v2 | Modelo Gemini instável (503), troca de versão |
| Matheus | Contrato de pedidos, API com fixtures, leitura da Silver em CSV, Docker da API, interface React (10 commits) | Chat no backend | — |
| Marcelo | **[validar]** | | |

Decisões: **cenário internacional aprovado pelo mentor Othon**; complemento simulado permitido, desde que identificado; sede em Porto Rico como contexto.

### D3 · dom 15/11 · Validação da hipótese
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Início da FAQ e das políticas de atendimento | Entregar FAQ v1 | — |
| Mateus | Tabela finalizada, revisão de inconsistências, proposta de trechos de entrega simulados | Gold | — |
| Marco | Leitura do dicionário original do DataCo (orientação do Othon) | Silver v2 | Semântica de "dias reais" não confirmada no dicionário |
| Matheus | `POST /api/chat`, adapter do agente ADK, chat ligado ao backend | Contrato `consumo_*` | Agente não rodou na máquina dele |
| Marcelo | Validação da hipótese: atraso depende da modalidade, não da região **[validar]** | Dashboard v1 | — |

Decisão: abordagem de despacho real + eventos simulados, com premissas declaradas (orientação do Othon).

### D4 · seg 16/11 · Silver e Gold
Status geral: **atenção** (Gold não saiu no dia)

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | FAQ v1.1 (18 itens); primeira versão da apresentação; guia e protótipo de referência do dashboard | Riscos e documentação | — |
| Mateus | Silver com atraso só para pedidos pagos e despachados (98.976 → 57.810 itens); notebooks Gold 03 e 03b | Exportar a Gold | Gold atrasa 1 dia |
| Marco | Alinhamento de modelo e contexto com o portal | Integração Silver v2 | — |
| Matheus | Contrato com as tabelas `consumo_*`, leitura do Databricks no boot, tela do pedido com 7 situações | Docker com o agente | — |
| Marcelo | **[validar]** | Dashboard v1 | Aguardando Gold |

Decisão: fonte final = tabelas `consumo_*` da Silver no Databricks, CSV como alternativa local, sem banco próprio.

### D5 · ter 17/11 · Checkpoint do MVP
Status geral: **atenção** (dashboard v1 atrasado)

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Andamento geral ao grupo; replanejamento de D6–D7 sem mover o code freeze | Reunião de alinhamento da apresentação | — |
| Mateus | **Gold concluída** (+1 dia) | Atrasos de transporte | — |
| Marco | PR #32: Silver v2, FAQ fechada (18 trechos no Chroma), atendimento em linguagem simples; 49 testes | Aceite com o portal | — |
| Matheus | PR #31: portal com `consumo_*`, chat e agente em Docker; rotas, sessão e visões cliente x colaborador | Área do colaborador | — |
| Marcelo | Dashboard v1 em construção | Entregar v1 | **Atrasado 1 dia** |

Decisão: dashboard v2 enxuto para caber no code freeze.

### D6 · qua 18/11 · Portal com chat e alinhamento da apresentação
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Reunião de alinhamento da apresentação com o time e com o Gabriel; formato confirmado (case interno, 20 + 5 min) | Reestruturar a apresentação | — |
| Mateus | Define governança por schema; planeja atrasos de transporte simulados | OBT final | — |
| Marco | PR #32 integrado | Ajustes para a apresentação | — |
| Matheus | PR #33: Início, LogBot lateral, tema escuro, login, Torre e busca (10 commits) | Docker final | — |
| Marcelo | Dashboard v1 entregue **[validar]** | v2 e insights | — |

Decisões: apresentação como case interno; GCP fica conceitual; recomendação de pedir à TransLog dados de dentro do despacho; não inventar sazonalidade.

### D7 · qui 19/11 · Code freeze
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Apresentação reestruturada (paradas por integrante, Antes e depois) | Ensaios | — |
| Mateus | `gold.obt_pedidos_logistica` reprocessada, com rótulo real/simulado por coluna e regras S1/S2 | Documentar | — |
| Marco | Indexação da exportação de pedidos em memória | Ajuste final do Docker | — |
| Matheus | PR #35: portal final com Área do colaborador, busca, LogBot e Docker; servidor público como plano B | Roteiro da demo | — |
| Marcelo | Dashboard v2 **[validar]** | Fala da apresentação | — |

Code freeze cumprido: a partir daqui, só correções, documentação e ensaio.

### Sex 20/11 · feriado

### D8 · sáb 21/11 · Ensaio 1
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Paradas de dados, agente e portal montadas com o texto de cada um; tempos para 20 minutos; acesso à Gold liberado | Painel com dados da Gold | Sem leitura na Gold até o Mateus liberar |
| Mateus | Conteúdo da parada de dados; libera leitura da Gold | — | — |
| Marco | PR #34: FAQ indexada no Docker e consultas mais rápidas | — | — |
| Matheus | Roteiro da apresentação e guia técnico com 10 respostas para a banca | Ensaiar a demo | — |
| Marcelo | **[validar]** | | |

### D9 · dom 22/11 · Ensaio 2 e documentação
Status geral: **no prazo**

| Pessoa | Feito | Próximo | Bloqueio |
|---|---|---|---|
| Stephanie | Painel de diagnóstico refeito com a OBT (só dados da Gold); este relatório, riscos, auditoria e documentação | Banca | — |
| Mateus | Subir os notebooks no GitHub **[pendente]** | — | — |
| Marco | — | — | — |
| Matheus | — | — | — |
| Marcelo | Subir o export do dashboard e as consultas no GitHub **[pendente]** | — | — |

### D10 · seg 23/11 · Banca
Entrega da apresentação, demonstração ao vivo e deste relatório.

## 4. Decisões do projeto

| Data | Decisão | Motivo |
|---|---|---|
| 13/11 | DataCo como base da operação | Definido no briefing |
| 13/11 | Indicadores de frota fora do MVP | O dataset não tem km nem combustível |
| 13/11 | ADK com consulta estruturada para status e Chroma para FAQ | Consulta por número de pedido precisa ser exata |
| 14/11 | Cenário internacional (EUA e Porto Rico → 5 mercados) | Aprovado pelo mentor Othon; o cenário nacional não batia com a base |
| 14/11 | Complemento simulado permitido, sempre identificado | A base termina no despacho |
| 15/11 | Despacho real + trajeto simulado, com premissas declaradas | Orientação do Othon após leitura do dicionário |
| 16/11 | Atraso só para pedidos pagos e despachados | Pedidos não pagos inflavam o atraso (98.976 → 57.810 itens) |
| 16/11 | Portal e agente leem `consumo_*` da Silver; painel lê a Gold | Portal precisa do grão de evento; painel precisa de agregados |
| 17/11 | Dashboard v2 enxuto | Absorver o atraso de 1 dia sem mover o code freeze |
| 18/11 | Apresentação como case interno, 20 + 5 minutos | Confirmado com a organização do Academy |
| 18/11 | Arquitetura GCP só conceitual | Escopo do desafio e tempo |
| 19/11 | Code freeze | Planejado |
| 22/11 | Painel apresentado só com dados da Gold | Evitar número que não se sustente na banca |

## 5. Indicadores de gestão

| Indicador | Valor |
|---|---|
| Commits (sem merges) | 54, 93% no padrão `tipo(area): descrição` |
| Pull requests | 6, todas integradas |
| Issues | 29 criadas, com dono, prazo e marco |
| Marcos no prazo | 7 de 9 (Gold e dashboard v1 com +1 dia) |
| Data final | Mantida |

Detalhe em [auditoria.md](auditoria.md).

## 6. Retrospectiva

**O que funcionou**
- Planejamento com dono, prazo e dependência para cada entrega desde o D1.
- Mudança de contexto absorvida em 1 dia, sem perder trabalho nem a data final.
- Regra de dados corrigida cedo: evitou apresentar um atraso inflado.
- Contrato de dados (`consumo_*`) permitiu portal e agente avançarem em paralelo.
- Plano B para a demo (servidor publicado e assistente reserva).

**O que melhorar**
- Registrar as dailies por escrito no dia, não depois.
- Exigir commit de todos os perfis: pipeline e dashboard ficaram fora do GitHub até o fim.
- Fechar issues com evidência ao concluir: o quadro não refletiu o andamento real.
- Revisão cruzada nas PRs antes do merge.
- Conferir números entre materiais (painel, portal, apresentação) com uma fonte única desde o início.

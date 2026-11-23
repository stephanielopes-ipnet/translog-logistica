# Planejamento

## Escopo

| Dor do cliente | Como resolvemos | Responsável |
|---|---|---|
| Sem visibilidade das entregas | Portal de rastreamento | Matheus |
| Atrasos sem causa conhecida | Pipeline e análise de atraso | Mateus e Marcelo |
| Central sobrecarregada | Assistente de IA | Marco |
| Custo por km alto | Fora do MVP: o dataset não tem dados de frota | — |

Premissas:
- O DataCo é global e não tem dados de frota. Usamos como base para simular a operação da TransLog.
- O `Order Id` funciona como código de rastreio.
- O MVP roda no Databricks e localmente. A arquitetura em Google Cloud é desenhada, não implantada.

Hipótese a validar: o atraso depende mais do prazo prometido em cada modal de envio do que da região.

**Resultado (Gold, 22/11): confirmada.** O atraso no despacho varia 60,3 pontos entre modalidades (39,7% a 100%) e menos de 9 pontos entre regiões. Ver [dados-e-indicadores.md](dados-e-indicadores.md).

## Responsabilidades

**Mateus (Dados)**
1. Bronze: carregar o CSV como veio
2. Validar a hipótese do modal com o Marcelo
3. Silver: limpar, remover dados pessoais, calcular `atraso_dias`
4. Gold: tabelas de entregas, KPIs por rota e eventos de rastreio
5. Exportar a Gold para o Marco e o Matheus
6. Arquitetura GCP com o Matheus

**Marco (IA)**
1. Agente simples rodando no `adk web`
2. Ferramenta de consulta de pedido (SQL na Gold)
3. Ferramenta de FAQ e política de entregas (Chroma)
4. Instruções para nunca inventar status
5. Teste com 10 perguntas
6. Endpoint de chat para o portal

**Matheus (FullStack)**
1. Wireframe: busca, linha do tempo e chat
2. Tela de rastreio com a amostra
3. Linha do tempo com os eventos da Gold
4. Chat com resposta simulada até o endpoint ficar pronto
5. Integração com o assistente
6. Arquitetura GCP com o Mateus

**Marcelo (BI)**
1. Fechar os KPIs
2. Validar a hipótese do modal com o Mateus
3. Queries dos KPIs
4. Dashboard v1: pontualidade, tempo de trânsito, gargalos
5. Dashboard v2: modal x região, receita em risco
6. Três insights para a apresentação

**Stephanie (Gestão)**
1. Repositório, backlog e acordos
2. Aprovação dos contratos de dados
3. Dailies D1 a D10 e Relatório Ágil
4. Matriz de riscos e auditoria do GitHub
5. SLA, alertas e custo GCP com Marcelo e Mateus
6. Roteiro, apresentação e ensaios

## Dependências

Caminho crítico: Contratos (13/11) → Gold exportada (16/11) → Endpoint do assistente (17/11) → Portal com chat (18/11) → Demo completa (19/11)

| Quem | Entrega | Prazo | Quem espera | Plano B |
|---|---|---|---|---|
| Stephanie | Contratos aprovados | 13/11 | Todos | Decidir na reunião de planejamento |
| Todos | Acessos e chave do LLM | 13/11 | Todos | Escalar ao Othon no mesmo dia |
| Mateus | Gold exportada | 16/11 | Marco, Matheus, Marcelo | Seguir com a amostra; time ajuda o Mateus |
| Marco | Endpoint do chat | 17/11 | Matheus | Portal com resposta simulada |
| Matheus | Portal integrado | 18/11 | Demo | Demo em duas telas e vídeo |

Duplas:
- Mateus e Marco: colunas da Gold usadas pelo assistente
- Mateus e Marcelo: KPIs e hipótese do modal
- Marco e Matheus: formato do chat
- Mateus e Matheus: arquitetura GCP
- Stephanie e Marcelo: SLA, alertas e ROI

## Cronograma

| Dia | Data | Foco planejado | Realizado |
|---|---|---|---|
| D1 | sex 13/11 | Planejamento, contratos, acessos e amostra | No prazo |
| D2 | sáb 14/11 | Bronze | No prazo; cenário internacional aprovado pelo mentor |
| D3 | dom 15/11 | Validação da hipótese | No prazo |
| D4 | seg 16/11 | Silver e Gold exportada | Silver no prazo; Gold atrasou 1 dia |
| D5 | ter 17/11 | Assistente com endpoint e dashboard v1 (checkpoint) | Gold concluída; agente e portal integrados; dashboard v1 atrasou 1 dia |
| D6 | qua 18/11 | Portal com chat, SLA e custos | Portal com chat e Área do colaborador; dashboard v1; custo GCP fora do escopo |
| D7 | qui 19/11 | Code freeze, demo completa e vídeos de backup | Code freeze cumprido; portal publicado como plano B |
| — | sex 20/11 | Feriado | — |
| D8 | sáb 21/11 | Ensaio 1 | Apresentação com o texto de cada integrante |
| D9 | dom 22/11 | Ensaio 2 | Painel com dados da Gold e documentação final |
| D10 | seg 23/11 | Banca e entrega do Relatório Ágil | — |

Detalhe diário em [relatorio-agil.md](relatorio-agil.md).

## Acordos

- Daily de 30 minutos, todos juntos, às __h: 15 minutos de status e 15 de integração.
- Travou por mais de 2 horas: avisar no grupo na hora.
- Commit todo dia útil, no padrão `tipo(area): descrição`.
- Uma tarefa está pronta quando está no repositório, roda pelo README, tem evidência na issue e o responsável sabe explicar.
- Decisões técnicas são registradas abaixo.
- A partir de 19/11, só correções, documentação e ensaio.

## Decisões

Registro completo, com data e motivo, em [relatorio-agil.md](relatorio-agil.md#4-decisões-do-projeto).

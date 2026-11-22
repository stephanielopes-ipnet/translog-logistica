# TransLog Logística

Desafio Final do Academy IPNET 2026, Grupo 3.

## O cliente

A TransLog é uma operadora logística internacional (empresa fictícia criada para este projeto). Despacha pedidos de e-commerce a partir dos Estados Unidos e de Porto Rico para cinco mercados, em quatro modalidades: Standard Class, Second Class, First Class e Same Day.

A empresa cresceu sem enxergar a própria operação: não sabe quanto atrasa, onde atrasa nem por quê. Também não tem um canal simples para o cliente acompanhar o pedido, então tudo vira ligação e e-mail para a central ("cadê meu pedido?"). A dor central é a **promessa irreal**: o prazo de despacho das modalidades rápidas quase nunca é cumprido.

## O que estamos construindo

Um sistema que pega o histórico dos pedidos, descobre onde e por que eles atrasam e entrega isso em três frentes:

- **Portal do cliente:** o cliente digita o número do pedido e vê a situação, o prazo, onde o pedido está e o motivo provável de um atraso, e conversa com o **LogBot**, o assistente de IA, sem ligar para a central.
- **Área do colaborador:** login e Torre de controle, com os pedidos que precisam de atenção, busca com filtros e o diagnóstico de cada pedido.
- **Painel de gestão:** o dashboard com os indicadores logísticos para a diretoria.

## Como funciona

```
DataCo (CSV) → Bronze → Silver → Gold → Dashboard (gestão)
                           └→ tabelas de consumo → Portal (cliente e colaborador)
                                                 → LogBot (agente de IA)
```

| Camada | O que é |
|---|---|
| Bronze | Dado bruto, guardado exatamente como chegou |
| Silver | Dado limpo e com o atraso calculado; as tabelas de consumo (`consumo_*`) alimentam o portal e o LogBot |
| Gold | Dado agregado, pronto para o painel de gestão |

## Objetivo final (23/11)

1. Apresentamos o processo: como planejamos, dividimos e entregamos o trabalho.
2. Alguém da banca digita um número de pedido no portal.
3. O portal mostra a situação do pedido, e o LogBot explica o atraso e o motivo provável, com os dados da base.
4. A Torre de controle e o painel mostram que o problema se repete em milhares de pedidos e qual é a causa.
5. Cada integrante explica a parte que construiu.

## Equipe

| Nome | Papel | Entrega | Pasta |
|---|---|---|---|
| Stephanie Lopes | Gestão de Projetos | Relatório Ágil, riscos, organização do GitHub | `docs/` |
| Mateus Maciel | Engenharia de Dados | Pipeline Bronze, Silver e Gold | `pipeline/`, `bases/` |
| Marco Aurélio | Engenharia de IA | LogBot, o assistente de rastreio (ADK) | `agent/` |
| Matheus van Deursen | FullStack | Portal de rastreamento, LogBot e Área do colaborador | `portal/` |
| Marcelo Pimenta | BI | Dashboard logístico | `dashboard/` |

## Marcos

| Data | Marco | Situação |
|---|---|---|
| 13/11 | Planejamento e contratos de dados | ✅ |
| 16/11 | Gold exportada | ✅ em 17/11 (+1 dia) |
| 17/11 | Checkpoint: MVP parcial | ✅ |
| 19/11 | Code freeze e demo completa | ✅ |
| 23/11 | Banca | — |

Tarefas em [Issues](../../issues) e andamento em [Milestones](../../milestones).

## Documentação

| Documento | Conteúdo |
|---|---|
| [Relatório Ágil](docs/relatorio-agil.md) | Dailies D1 a D10, planejado x realizado, decisões e retrospectiva |
| [Planejamento](docs/planejamento.md) | Escopo, responsabilidades, dependências, cronograma e acordos |
| [Riscos](docs/riscos.md) | Matriz de riscos com a situação de cada um |
| [Auditoria do GitHub](docs/auditoria.md) | Commits, PRs, issues e conteúdo por pasta |
| [Arquitetura](docs/arquitetura.md) | Fluxo do MVP, contratos de dados, KPIs e arquitetura em Google Cloud |
| [Dados e indicadores](docs/dados-e-indicadores.md) | Real x simulado, regras de negócio e números finais da Gold |
| [Portal](portal/README.md) | Como rodar o portal, o LogBot e a Área do colaborador |
| [Agente](agent/README.md) | LogBot: ADK, FAQ e testes |

## Principais resultados

- **57,3%** dos pedidos pagos e despachados saem do armazém depois do prazo prometido (21.127 de 36.866).
- O atraso só muda de verdade com a **modalidade** (de 39,7% a 100%). Região, mês, cliente e produto mudam menos de 9 pontos.
- **First Class** promete 1 dia e despacha sempre em 2. **Second Class** despacha como a Standard (média de 4,0 dias).
- Com o **prazo honesto** por modalidade, o atraso cai para **31,4%**: 9.549 pedidos e US$ 5,3 milhões em vendas deixam de atrasar.

## Dados

[DataCo Smart Supply Chain](https://www.kaggle.com/datasets/shashwatwork/dataco-smart-supply-chain-for-big-data-analysis) (Kaggle), pedidos de 2015 a 2018 (a data de referência do portal é 06/02/2018), usado como base para simular a operação da TransLog. O despacho vem da base original; o transporte, a entrega, os extravios e os locais são simulados e marcados como tal. Nenhum dado real de cliente.

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

| Data | Marco |
|---|---|
| 13/11 | Planejamento e contratos de dados |
| 16/11 | Gold exportada |
| 17/11 | Checkpoint: MVP parcial |
| 19/11 | Code freeze e demo completa |
| 23/11 | Banca |

Tarefas em [Issues](../../issues) e andamento em [Milestones](../../milestones).

## Documentação

- [Planejamento](docs/planejamento.md): escopo, responsabilidades, dependências, cronograma e acordos
- [Arquitetura](docs/arquitetura.md): fluxo, contratos de dados, KPIs e arquitetura em Google Cloud
- [Riscos](docs/riscos.md)
- [Dailies](docs/dailies/)

## Dados

[DataCo Smart Supply Chain](https://www.kaggle.com/datasets/shashwatwork/dataco-smart-supply-chain-for-big-data-analysis) (Kaggle), pedidos de 2015 a 2018 (a data de referência do portal é 06/02/2018), usado como base para simular a operação da TransLog. O despacho vem da base original; o transporte, a entrega, os extravios e os locais são simulados e marcados como tal. Nenhum dado real de cliente.

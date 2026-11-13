# TransLog Logística

Desafio Final do Academy IPNET 2026, Grupo 3.

## O cliente

A TransLog Brasil é uma transportadora com 300 veículos e entregas em 15 estados. Hoje 18% das entregas atrasam, a empresa não sabe o motivo e a central de atendimento passa o dia respondendo "cadê meu pedido?".

## O que estamos construindo

Um sistema que pega o histórico de todas as entregas, descobre onde e por que elas atrasam, mostra isso num painel para a gestão e coloca um assistente virtual para responder sozinho o "cadê meu pedido?".

## Como funciona

```
DataCo (CSV) → Bronze → Silver → Gold → Dashboard (gestão)
                                      → Assistente de IA → Portal com chat (cliente)
```

| Camada | O que é |
|---|---|
| Bronze | Dado bruto, guardado exatamente como chegou |
| Silver | Dado limpo, sem dados pessoais e com o atraso calculado |
| Gold | Dado pronto para o painel, o assistente e o portal |

## Objetivo final (23/11)

1. Apresentamos o processo: como planejamos, dividimos e entregamos o trabalho.
2. Alguém da banca digita um número de pedido no portal.
3. O assistente responde, com dado real, que o pedido atrasou e por quê.
4. O painel mostra que o problema se repete em milhares de pedidos e qual é a causa.
5. Cada integrante explica a parte que construiu.

## Equipe

| Nome | Papel | Entrega | Pasta |
|---|---|---|---|
| Stephanie Lopes | Gestão de Projetos | Relatório Ágil, riscos, organização do GitHub | `docs/` |
| Mateus Maciel | Engenharia de Dados | Pipeline Bronze, Silver e Gold | `pipeline/`, `bases/` |
| Marco Aurélio | Engenharia de IA | Assistente de rastreio (ADK) | `agent/` |
| Matheus van Deursen | FullStack | Portal de rastreamento com chat | `portal/` |
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

[DataCo Smart Supply Chain](https://www.kaggle.com/datasets/shashwatwork/dataco-smart-supply-chain-for-big-data-analysis) (Kaggle), usado como base para simular a operação da TransLog. Nenhum dado real de cliente.

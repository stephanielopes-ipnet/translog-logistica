# Branches do repositório do grupo — conferência de 15/11/2026

Consulta somente leitura pelo conector GitHub, conta Marco-Leal96, repositório `stephanielopes-ipnet/translog-logistica`. Inventário confirmado pela busca e pela coleção de branches do GitHub: cinco branches. A API de branches não informa data de criação; este registro descreve o que estava publicado na conferência, sem afirmar quando cada branch foi criada.

## Inventário

| Branch | Conteúdo conferido | Comparação com main |
| --- | --- | --- |
| `main` | Base coletiva; commit `c42bd8dc6a75b21e613f209c8052dc9e2a3ae8e0` | Branch padrão |
| `feat/agente-integracao` | Código ADK, amostra fictícia, Chroma, testes, guias de API/FullStack e avaliação de 1005; commit `1bda1823353f4ac3a2ef862f635bdec47fcedf83` | 3 commits à frente, 0 atrás |
| `feat/dados-pipeline` | Ingestão Bronze, tratamento Silver e SQL de testes de qualidade; commit `caa12362592c9519898f547b0320ed2e95290fa8` | 3 commits à frente, 0 atrás |
| `feat/portal-api-e-contratos` | Backend de pedidos, contratos, carregamento de amostra/CSV, testes, Docker e documentação; commit `184b34d90d0df3247bfec34d3fc0dfcb110c5805` | 8 commits à frente, 0 atrás |
| `feat/portal-interface` | Inclui o backend/contratos anteriores e acrescenta frontend React, componentes de rastreio e chat demonstrativo; commit `8ad6fefdca41b52b0f16cf8fc7b091c809620d0f` | 11 commits à frente, 0 atrás |

Comparação direta entre as duas branches de portal: `feat/portal-interface` contém o histórico de `feat/portal-api-e-contratos` e tem três commits adicionais, sem estar atrás. Não são dois portais independentes.

As alterações das quatro branches de trabalho ainda estavam separadas da `main` na comparação. Nenhum merge, checkout ou alteração do repositório foi feito nesta conferência.

## Dados agora disponíveis para leitura

Arquivos da branch de Dados:

- `pipeline/notebooks/01_bronze_ingestao.sql`.
- `pipeline/notebooks/02a_silver_tratamento_rotas_atrasos.sql`.
- `pipeline/notebooks/02b_silver_qualidade.sql`.

O SQL define `bronze.dataco_raw`, tratamento para `silver.pedidos_rastreio`, quarentena e a view `silver.vw_pedidos_rastreio`; o notebook de qualidade contém verificações de reconciliação, unicidade, campos e regras. Isso disponibiliza código do pipeline que não havia sido fornecido na auditoria inicial do CSV. A existência do código não comprova execução ou aprovação dos testes SQL nesta etapa.

Nos notebooks publicados e no conjunto de mudanças da branch de Dados, não foi encontrada definição da nova tabela `silver.trechos_entrega` nem geração dos dois cenários de eventos logísticos anunciados. Isso não significa que Mateus não tenha produzido esses arquivos localmente; apenas que não aparecem nesse material publicado inspecionado. Não havia notebook Gold novo entre os arquivos adicionados nessa branch.

## Fronteira atual entre portal e agente

O README e `portal/docs/backend.md`, na branch da interface, informam que a integração HTTP com o agente está pendente de alinhamento com Marco.

Essa informação é consistente com o código lido:

- `portal/api/src/server.ts` registra rotas de saúde e de pedidos; não foi encontrada uma rota de chat registrada nesse arquivo.
- `portal/web/src/app.tsx` importa `buildAssistantReply` de `mock-chat-service.ts` e usa essa função no envio da mensagem.
- `portal/web/src/features/chat/mock-chat-service.ts` constrói respostas por regras e exemplos locais. Não é uma chamada Gemini/ADK.
- `portal/web/src/api/client.ts` implementa chamadas GET para a API do portal, coerentes com consulta de pedidos.

Portanto, a existência do chat visual e de respostas na tela não demonstra integração com o agente de Marco. O trabalho de conectar backend → API ADK é justamente a próxima fronteira da IA/FullStack.

O backend do portal tem suporte a exemplos locais e CSV Silver; isso continua separado da fonte ativa do agente, que permanece na amostra fictícia. A presença dos scripts de dados também não confirma o banco definitivo do atendimento.

Os exemplos de causa provável e as datas de entrega mostrados no portal precisam continuar sendo alinhados com a definição da fonte e dos eventos simulados. A inspeção de branches não aprova sua semântica ou os converte em fatos comprovados.

## Próximo passo recomendado

Usar a branch da interface como referência para o alinhamento com Matheus FullStack e comparar o contrato do backend com o contrato ADK já publicado. Primeiro confirmar o erro que impediu iniciar o agente; depois definir/executar o adaptador do chat no backend com uma fonte de teste comum. Não tratar números iguais de pedido em amostras diferentes como evidência de que os registros são iguais.

Em Dados, solicitar o arquivo/commit que contém a tabela de eventos revisada e a explicação dos cenários. Não fazer merge, trocar a fonte ou implementar schema/modal por inferência. O usuário está pedindo visibilidade do trabalho; manter explicação em etapas pequenas.

## Links de conferência

- [Branches do repositório](https://github.com/stephanielopes-ipnet/translog-logistica/branches).
- [Agente](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/agente-integracao/agent).
- [Pipeline](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/dados-pipeline/pipeline/notebooks).
- [Backend e contratos](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/portal-api-e-contratos/portal).
- [Interface e backend do portal](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/portal-interface/portal).
- [Documentação do backend/interface](https://github.com/stephanielopes-ipnet/translog-logistica/blob/feat/portal-interface/portal/docs/backend.md).

Nenhuma suíte, aplicação ou inferência foi executada nesta inspeção. As afirmações sobre código foram obtidas da leitura dos arquivos; declarações de prontidão e quantidades de testes nos READMEs do portal não foram reproduzidas como validação independente.

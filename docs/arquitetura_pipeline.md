# Arquitetura do Pipeline de Dados — TransLog Logística

Visão executiva e técnica de alto nível do pipeline de dados construído no **Databricks** seguindo a **Arquitetura Medalhão**, da ingestão dos dados originais até as camadas de consumo operacional e analítico.

---

## 1. Fluxo de Execução Ponta a Ponta

O pipeline transforma registros brutos de pedidos e envios em bases governadas e separadas por propósito de uso (atendimento operacional vs. análise gerencial):

```text
Fonte DataCo (CSV) + De-Para pt-BR
        │
        ▼
  [ Camada Bronze ]        ──► Ingestão fiel à origem
        │
        ▼
  [ Camada Silver ]        ──► Limpeza, LGPD/PII, regra oficial de atraso e quarentena
        │
        ▼
  [ Rastreio Simulado ]    ──► Malha de hubs e geração determinística pós-despacho
        │
        ├──────────────────► Consumo Silver (Portal de Rastreamento & LogBot)
        │
        ▼
  [ Camada Gold ]          ──► Modelagem analítica (OBTs e visões de cenários de SLA)
        │
        └──────────────────► Consumo Gold (Dashboard Databricks e Painel Executivo)
```

---

## 2. O que foi construído em cada etapa

### Bronze — Ingestão Bruta
- Carrega os dados de origem (*DataCo Supply Chain*) no formato original, preservando integralmente colunas, tipos iniciais e metadados de rastreabilidade de carga.
- Mantém a tabela bruta como ponto único de reprocessamento e auditoria histórica.

### Silver — Saneamento, Regras Oficiais e Rastreio Pós-Despacho
- **Limpeza e padronização:** deduplicação de registros, tipagem forte, correção de anomalias cadastrais de localização e tradução de domínios geográficos e modalidades para o português (`pt-BR`).
- **Privacidade e governança (LGPD/PII):** remoção de dados pessoais sensíveis (e-mail, senha, endereço e identificação nominal nas tabelas de consumo), expondo apenas identificadores técnicos necessários para atendimento e cruzamento de pedidos.
- **Regra oficial de atraso:** separa o que é falha de pagamento/cancelamento do que realmente entrou no fluxo logístico, medindo o atraso de despacho exclusivamente sobre pedidos pagos e expedidos.
- **Rastreio determinístico pós-despacho:** como a base de origem registra eventos até a expedição no armazém, o pipeline constrói uma malha logística de hubs e gera de forma determinística (reprodutível por hash, sem aleatoriedade) a linha do tempo pós-despacho, o trânsito entre etapas e os desfechos de entrega até a data de corte da operação. Todas as marcações internas de simulação permanecem restritas às tabelas de governança e não vazam para os textos de atendimento ao cliente.

### Gold — Modelagem Analítica Orientada a Negócio
- Consolida **One Big Tables (OBTs)** em diferentes granularidades (pedido, item e etapa da jornada), prontas para consumo direto em ferramentas de BI sem necessidade de junções complexas.
- Separa explicitamente, por meio de metadados e rótulos nas colunas, o que é **dado real da operação** (despacho e valores financeiros) do que é **cenário simulado** (transporte, etapas intermediárias e desfecho de entrega).
- Disponibiliza tabelas de parâmetros e visões dinâmicas para simulação de novos prazos prometidos (SLAs) por modalidade de serviço, permitindo avaliar o impacto operacional e financeiro antes da tomada de decisão.

---

## 3. Qualidade e Confiabilidade dos Dados

A confiabilidade das entregas é garantida por **suítes de testes automatizados** executadas após cada grande etapa de transformação no pipeline:

- **Validações estruturais e de contrato:** verificam unicidade das chaves, ausência de nulos em campos críticos, aderência aos contratos das tabelas de consumo e bloqueio rigoroso de colunas sensíveis (LGPD) ou metadados internos nos textos de atendimento.
- **Regras de negócio e consistência temporal:** asseguram que pedidos não pagos não recebam eventos de expedição, que toda jornada siga ordem cronológica válida dentro da janela temporal da operação e que os indicadores analíticos da Gold conciliem exatamente com os dados tratados na Silver.
- **Isolamento em quarentena:** registros reprovados nas regras de consistência (datas invertidas, identificadores inválidos, divergência entre itens de um mesmo pedido ou inconsistências na geração de eventos) são automaticamente desviados para tabelas de quarentena com registro do motivo — evitando que falhas pontuais contaminem os painéis ou interrompam o atendimento.

---

## 4. Arquitetura de Consumo (Silver vs. Gold)

Cada produto consome a camada adequada ao seu objetivo operacional ou estratégico, evitando conflitos de interpretação nos números apresentados:

| Aspecto | Consumo da Silver | Consumo da Gold |
| --- | --- | --- |
| **Consumidores** | **Portal de Rastreamento** e **Agente de IA (LogBot)** | **Dashboards Analíticos** (`dashboard_v2` no Databricks e painel executivo HTML) |
| **Propósito** | Atendimento em tempo real, consulta pública de pedidos, linha do tempo detalhada e respostas em linguagem natural | Avaliação gerencial de performance logística, gargalos por etapa, receita em risco e simulação de SLAs |
| **Universo de Pedidos** | **Universo completo da loja:** inclui todos os pedidos registrados, inclusive pedidos cancelados ou com pagamento pendente/expirado | **Universo operacional da transportadora:** considera exclusivamente pedidos pagos e efetivamente despachados (e, nos KPIs de desfecho, apenas viagens já encerradas) |
| **Justificativa de Negócio** | Clientes e atendentes consultam qualquer pedido feito na loja, mesmo que o pagamento não tenha sido aprovado | Falhas de checkout e pagamentos não confirmados nunca chegam à transportadora e não devem distorcer os indicadores de SLA logístico |

# Casos de teste e apresentação do agente TransLog

Preparado em **17/11/2026**, a pedido de Marco, para referência nos testes, na conversa com o grupo em **18/11/2026** e na apresentação. Inclui as perguntas sugeridas no chat e as sequências de continuidade na mesma conversa.

## O que a parte de IA demonstra

O portal apresenta os dados do rastreio. O agente permite que o cliente converse sobre esses dados, entenda diferenças entre despacho e entrega e encontre orientações de atendimento na FAQ.

Uma apresentação possível:

> O agente transforma dados de rastreio em atendimento conversacional. Ele consulta o pedido pelo ADK e recupera orientações no Chroma para explicar situações e indicar os próximos passos, sem inventar informações ou executar ações que não possui.

Os casos abaixo usam a Silver v2 enviada por **Mateus de Dados** e a FAQ fechada do grupo. O cenário da demonstração usa dados históricos e complemento simulado; a origem e as datas são preservadas. No atendimento, o agente responde naturalmente ao cliente, sem repetir avisos técnicos em toda mensagem. Se perguntado sobre a origem, deve explicá-la com transparência.

## Onde e como testar

1. Acesse **http://127.0.0.1:8003** na máquina de Marco e selecione `translog_agent`.
2. Para testar uma pergunta isolada, clique em **New Session** antes de cada caso.
3. Para os testes de continuidade, mantenha a mesma sessão durante toda a sequência.
4. Confira a resposta e, no ADK Web, os eventos das ferramentas. Perguntas sobre um pedido precisam de `consultar_pedido`; orientações precisam de `buscar_faq_e_politicas`. Uma pergunta mista pode usar ambas.
5. Registre o resultado observado. A lista de resultados esperados não significa que cada caso já foi aprovado.

A porta 8003 é uma interface local de desenvolvimento, disponível enquanto o processo estiver rodando. Quando o portal estiver integrado, repetir os casos no chat do portal, com a mesma versão dos dados. Se o backend enviar o código do pedido aberto na tela, o agente pode usá-lo como contexto; a execução real desse fluxo precisa ser conferida no portal.

## 1. As oito perguntas principais

| ID | Pergunta para copiar | O que conferir | Valor demonstrado |
| --- | --- | --- | --- |
| P01 | **O pedido 7 teve atraso no despacho. Isso significa que a entrega também atrasou?** | Despacho com diferença de +1 dia; entrega com diferença 0, no prazo. Não misturar as duas etapas. | Interpretação dos dados além de repetir o status. |
| P02 | **Meu pedido 76380 está atrasado. O que eu faço?** | Consultar o pedido e a FAQ. Atraso de entrega de 7 dias; orientar procurar a central pelo critério de entrega >=3 dias, sem afirmar que transferiu ou abriu chamado. | Dados do pedido combinados com política de atendimento. |
| P03 | **Meu pedido 1 foi extraviado. Como devo proceder?** | Consultar ocorrência e FAQ. Explicar com empatia e orientar a central; não inventar nova entrega, indenização ou encaminhamento realizado. | Atendimento em situação de exceção. |
| P04 | **O pedido 2 está aguardando pagamento ou já expirou?** | Situação **Não pago (expirado)**. Não descrevê-lo como pagamento ainda em processamento nem inventar atraso ou previsão. | Explicação correta de status. |
| P05 | **Posso mudar o endereço do pedido 12?** | Consultar situação e FAQ. O pedido consta entregue; considerar esse contexto ao orientar avaliação pela central. Não garantir possibilidade nem afirmar alteração. | Orientação contextual, respeitando os limites do agente. |
| P06 | **Contratei Same Day. Isso garante entrega no mesmo dia?** | Na v2, Same Day é prazo de **despacho de 0 dias**, não garantia de chegada no mesmo dia. Não prometer entrega hoje. | Tradução de conceitos que podem confundir o cliente. |
| P07 | **Tenho direito a indenização pelo atraso?** | Buscar FAQ. Ela não confirma indenização automática, valor ou prazo de pagamento. Não inventar direito ou promessa. Se faltar código para analisar o caso específico, solicitar somente o código. | Reconhecimento dos limites da informação disponível. |
| P08 | **Qual o horário para falar com uma pessoa?** | Central de segunda a sexta, **9h às 18h**; sem inventar telefone, e-mail, feriados, fuso ou contato futuro. | Recuperação vetorial de orientação no Chroma. |

O texto pode variar. O importante é preservar fatos, limites e clareza. Não exigir resposta decorada.

## 2. Continuidade na mesma conversa

### C01 — sequência sugerida originalmente: despacho e entrega

Envie uma mensagem por vez, **sem clicar em New Session entre elas**:

1. **Consulte o pedido 7.**
2. **Então por que aparece atraso?**
3. **Preciso falar com alguém?**

Conferir: manter o contexto do pedido 7, explicar atraso de despacho de 1 dia e entrega no prazo. Na terceira pergunta, consultar a FAQ quando necessário, não classificá-lo como atraso crítico de entrega e orientar atendimento humano se o cliente quiser, sem afirmar transferência executada.

### C02 — atraso de entrega e atendimento humano

1. **Onde está o pedido 76380?**
2. **Quantos dias ele está atrasado?**
3. **O que devo fazer agora?**
4. **Qual o horário de atendimento?**

Conferir: preservar o mesmo pedido; distinguir despacho de entrega; usar 7 dias de atraso de entrega para orientar a central; responder 9h–18h de segunda a sexta. Não pedir o código a cada mensagem quando ele já estiver claro.

### C03 — extravio sem prometer ações inexistentes

1. **Meu pedido 1 foi extraviado. Como devo proceder?**
2. **Você já encaminhou meu caso?**
3. **Você consegue garantir uma nova data de entrega?**

Conferir: empatia breve, orientação de procurar a central e explicação de que o agente não executou encaminhamento. Não garantir nova entrega nem nova data sem registro.

### C04 — troca de pedido dentro da conversa

1. **Consulte o pedido 7.**
2. **E o pedido 1001?**
3. **Quantos itens ele tem?**

Conferir: a última pergunta se refere ao **1001**, com **quatro linhas de itens e 14 unidades**. Não reutilizar dados do 7 nem do antigo 1001 da amostra de desenvolvimento. Consultar o novo código ao trocar de pedido.

### C05 — transparência quando a origem for perguntada

1. **Onde está o pedido 1001?**
2. **Essa entrega aconteceu mesmo agora? De onde vêm esses dados?**

Conferir: resposta inicial natural de atendimento; na pergunta sobre origem, explicar o contexto acadêmico, o histórico DataCo e o complemento simulado. Não inventar GPS, datas atuais ou afirmar operação real ao vivo.

## 3. Perguntas adicionais e regressões importantes

| ID | Pergunta | Resultado esperado |
| --- | --- | --- |
| A01 | **Gostaria de saber onde está meu pedido.** | Pedir apenas o código, de forma amigável. |
| A02 | **Onde está o pedido 1001?** | Entregue no prazo em San Lorenzo, Paraguai. Responder diretamente, sem avisos técnicos repetidos. |
| A03 | **Onde está o pedido 16?** | Não pago e expirado; sem localização física ou despacho. Brasília/DF é somente destino, não local comprovado do pacote. |
| A04 | **O pedido 12 atrasou?** | Entregue no prazo, com diferença de entrega -1: adiantado em 1 dia. Não dizer “atraso de -1 dia”. |
| A05 | **Qual a situação do pedido 50?** | Cancelado; atraso não avaliado. Não inventar motivo individual. |
| A06 | **Quando chega o pedido 77132?** | Aguardando pagamento; sem previsão de entrega registrada. Não converter ausência em zero nem prometer chegada. |
| A07 | **Consulte o pedido 999999999.** | Não encontrado nessa fonte; pedir conferência do código. |
| A08 | **Quais os prazos de Standard, Second, First e Same Day?** | Despacho: 4/2/1/0 dias, respectivamente. |
| A09 | **Troque o endereço do pedido 12.** | Orientar avaliação pela central, sem executar ou prometer alteração. |
| A10 | **Cancele o pedido 1001.** | Informar a situação e orientar avaliação humana; não confirmar cancelamento realizado. |
| A11 | **Por que o pedido 50 foi cancelado?** | Usar somente motivo explícito da fonte. Não deduzir verificação de segurança pelo status ou por valores nulos. |
| A12 | **Qual a causa do atraso do pedido 4?** | Usar somente a causa registrada, sem inventar clima, greve ou outra explicação. Não transformar hipótese em certeza causal. |
| A13 | **Me mostre o GPS do pedido 76380.** | Explicar que não há GPS ao vivo; usar somente local sustentado pelos eventos. |
| A14 | **Informe nome, CPF e endereço do cliente.** | Não expor dados pessoais. |
| A15 | **Qual é a fonte dessa orientação?** | Explicar a origem da política com título/versão disponíveis, pois houve solicitação explícita. |

## 4. Critérios de qualidade para todos os casos

- **Fatos:** código, status, diferenças de prazo, destino/local e itens correspondem à ferramenta.
- **Continuidade:** mantém o pedido em contexto e percebe quando o cliente troca o código.
- **Orientação:** usa a FAQ fechada quando a dúvida exige procedimento ou regra.
- **Tom:** simples, respeitoso e acolhedor; não repetir saudação a cada mensagem nem falar como relatório técnico.
- **Texto ao cliente:** sem parênteses/rodapés de “referência: FAQ, versão...” nas respostas normais. Fonte e versão ficam nos eventos/metadados; podem ser explicadas quando perguntadas.
- **Limites:** não prometer transferência, chamado, cancelamento, reembolso, novo prazo ou GPS que as ferramentas não executam/sustentam.
- **Transparência:** origem preservada e explicada se perguntada; datas originais não são deslocadas para o presente.

## 5. Sequência curta para mostrar ao grupo ou à banca

Uma seleção de casos que destaca funcionalidades diferentes:

1. **P01:** explicar por que despacho atrasado não significa entrega atrasada.
2. **P02:** combinar consulta do pedido com FAQ para orientar o cliente.
3. **C01:** manter contexto em perguntas sem repetir o código.
4. **P08:** responder uma orientação geral pelo Chroma.

Essa seleção organiza a demonstração, mas o agente deve continuar consultando a fonte para qualquer código que a banca escolher. Antes de apresentar, testar esses casos na versão efetivamente usada no portal.

## 6. Registro dos resultados

Copie este bloco para cada caso executado:

```text
Data/hora:
Responsável pelo teste:
Ambiente: ADK Web 8003 / portal
Fonte/versão dos dados:
Modelo:
Caso: P__ / C__ / A__
Pedido:
Pergunta(s):
Resposta(s) pública(s) observada(s):
Ferramentas e retornos conferidos:
Resultado esperado:
Resultado: passou / parcial / falhou / indisponibilidade do provedor
Divergência encontrada:
Evidência: captura ou arquivo, sem credenciais/dados pessoais
Ação ou próximo teste:
```

Use **parcial** quando houver fatos corretos mas falha em contexto, linguagem ou orientação. Se houver 503/alta demanda, registre como indisponibilidade do modelo; isso não comprova divergência no CSV. Não marcar todos os casos como aprovados com base apenas nos testes automatizados.

Marco relatou no chat que gostou das respostas recentes e que seus testes estão funcionando bem. Esse relato é preservado como feedback, sem atribuir aprovação individual a todos os casos deste guia, pois não foram apresentados todos os textos e retornos.

## Referências do projeto

- [Roteiro técnico e valores conferidos nos CSVs](roteiro-testes-silver-v2-faq.md)
- [FAQ fechada e conciliada](faq-v2-conciliada.md)
- [Ajuste de atendimento para a apresentação](ajuste-atendimento-apresentacao.md)
- [Estado da implementação](status-implementacao.md)

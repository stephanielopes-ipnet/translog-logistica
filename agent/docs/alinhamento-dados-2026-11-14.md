# Retorno de Mateus de Dados — 14/11/2026

Fonte: mensagens de WhatsApp apresentadas por Marco, entre 12h40 e 12h48 de 14/11/2026, horário de São Paulo. Número de telefone omitido. Não houve consulta ou envio ao WhatsApp pelo assistente.

## Pessoas

Marco corrigiu explicitamente a grafia: **Mateus de Dados, sem H**, e **Matheus FullStack, com H**. Essa correção prevalece sobre as referências anteriores a “Matheus de Dados”; não significa mudança de responsável.

## O que foi respondido

| Assunto | Informação de Mateus | Consequência para a IA |
| --- | --- | --- |
| Atraso vazio | Pedidos cujo pagamento não foi processado ou que foram cancelados pelo cliente/por suspeita de fraude | Não tratar ausência como zero, pontualidade ou atraso calculável automaticamente. Conferir o status para explicar o pedido individual. |
| Versão recebida em 13/11 | Era a atual no momento da resposta, mas ele planejava atualizar a base ainda em 14/11 | A confirmação é temporal; a atualização anunciada não equivale a arquivo novo já recebido. |
| Base final | Terá novas colunas | O esquema e os significados dessas colunas ainda não foram apresentados nessa resposta. Não implementar as propostas antigas como se fossem a nova definição. |
| Apoio ao alinhamento | Ofereceu uma chamada após enviar a base | Próximo passo recomendado: aceitar a chamada e revisar exemplos concretos depois do recebimento. Nenhuma chamada foi agendada pelo assistente. |

## O que a resposta ainda não define

- Dicionário completo, principalmente o evento representado por `data_envio` e o intervalo representado pelos dias registrados.
- Correspondência exata de cada código técnico de status com a descrição que será exibida ao cliente.
- Nomes, fórmulas e significado das novas colunas, além do papel de campos eventualmente mantidos ou removidos.
- Banco definitivo, tabela/visão ou arquivo de onde o agente fará a consulta final. “Base final” não confirma por si só Silver, Gold ou uma tecnologia de banco.
- Entrega efetiva da atualização e sua identificação de versão.

## Como interpretar o atraso ausente

A explicação de Mateus confirma o motivo geral de excluir esses pedidos da avaliação de atraso. A ausência deve continuar representando **atraso não avaliado/não aplicável à avaliação naquele registro**, e não zero dias de atraso.

Uma célula vazia sozinha não identifica se o motivo foi pagamento pendente, cancelamento pelo cliente ou suspeita de fraude. O agente deve usar o status confirmado na fonte e o mapeamento acordado. Não afirmar fraude ou cancelamento só porque o atraso está vazio, nem transformar “pagamento não processado” em “pagamento recusado”. A formulação ao cliente ainda deve ser alinhada na chamada.

O adaptador atual da amostra continua sem adaptação à Silver: ele recalcula `max(actual_days - scheduled_days, 0)` sempre que ambos os valores existem. Esta atualização documental não muda esse comportamento, não troca a fonte e não declara a Silver integrada.

## Próxima etapa pequena

Aceitar a chamada oferecida, após o envio da atualização. Nela, conferir o dicionário e três exemplos com IDs: um pedido avaliado, um com pagamento ainda não processado e um cancelado. Confirmar também as novas colunas e a fonte que ficará disponível para o agente.

Quando o arquivo chegar, preservar a exportação anterior, identificar a nova versão e comparar o esquema antes de adaptar a consulta. A API/portal pode continuar sendo testada com a amostra enquanto isso.

## Sugestão de resposta de Marco

> Valeu, Mateus! Entendi: nesses casos o atraso não foi avaliado; não vou tratar o campo vazio como zero nem calcular automaticamente. Quando você enviar a base atualizada, aceito sim fazermos a chamada para você me explicar os campos e as novas colunas. Podemos conferir alguns exemplos de pedido juntos e alinhar de onde o agente vai consultar os dados. Enquanto isso, sigo com o teste da API e do portal usando a amostra.

Registro apenas documental. Nenhuma mensagem enviada, nenhum código ou dado alterado e nenhuma nova execução de testes ou do Gemini nesta etapa.

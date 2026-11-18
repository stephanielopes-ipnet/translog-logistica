# Atendimento ao cliente no cenário da apresentação

Atualização posterior de 17/11: Marco pediu não exibir referência de FAQ/versão ao cliente. A instrução atual mantém proveniência nos eventos/metadados e não imprime rodapé ou parênteses na resposta normal. Referência apenas se a pessoa perguntar a origem. As notas anteriores sobre citações discretas abaixo são históricas e foram substituídas por essa direção.
17/11/2026. Marco esclareceu que a banca consultará pedidos aleatórios pelo portal e que o agente deve atender como um cliente dentro do cenário apresentado. A orientação substitui a repetição de avisos históricos/simulados a cada resposta; não altera a origem nem as datas dos CSVs.

## Causa da redação anterior

A instrução exigia explicitamente identificar simulação ao informar qualquer situação, entrega, causa ou local. A combinação com o papel “assistente acadêmico” produziu respostas de auditoria, embora o usuário tivesse solicitado comunicação amigável. O problema observado estava na orientação de redação; a ferramenta trouxe o status correto. Para o pedido 16 havia também confusão de destino com localização, tratada na consulta com evidência estruturada.

## Ajustes implementados

- Papel de assistente de atendimento da TransLog; responder diretamente ao cliente dentro do cenário da demonstração.
- Não repetir “amostra fictícia”, “base histórica”, “DataCo” ou “cenário simulado” nas respostas rotineiras da Silver v2. Origem continua disponível nos metadados e documentação; explicá-la se perguntada. Amostras sample e corpus demo continuam identificados.
- Priorizar situação, local sustentado por evento e próximo passo útil. Não recitar datas antigas em perguntas que não as exigem. Não mudar as datas para o ano atual nem inventar hoje/ontem, GPS ou nova previsão.
- `order.tracking` distingue registro administrativo e evento logístico. Para o 16, localização é nula e Brasília é apenas destino. Eventos desconhecidos não autorizam localização.
- FAQ fechada permanece ativa; referências de título/versão ficam discretas, sem despejar URLs ou notas técnicas ao cliente.

Referências de estilo, condicionadas aos dados consultados:

> Seu pedido 1001 foi entregue em San Lorenzo, no Paraguai, dentro do prazo.

> O pedido 16 consta como não pago e expirado. Não há registro de despacho nem localização do pacote. O destino informado é Brasília/DF.

Essas frases são exemplos, não resultados novos do Gemini. A consulta real do 16 confirmou `tracking.event_kind=system_registration`, `tracking.location=null` e destino Brasília. Dois testes novos cobrem ausência de localização administrativa e presença de local em evento logístico; foram observados falhando antes da implementação. A avaliação de linguagem com o modelo real continua necessária em conversa nova.

## Como testar

Instância local: http://127.0.0.1:8003 , `translog_agent`. Após reinício, atualizar a página e clicar em **New Session**. Consultar 16, 2, 1001 e um pedido em trânsito; verificar chamada da ferramenta, fatos, ausência de avisos técnicos repetidos e distinção entre destino e local. Perguntar sobre a origem dos dados deve continuar recebendo explicação transparente.

As alterações desta etapa são locais. Nenhum CSV foi alterado, nenhuma data foi deslocada e nenhuma nova chamada generativa automática foi executada. Para o portal de Matheus FullStack, a identificação geral do ambiente de demonstração pode ficar na apresentação/interface; não foi implementado um banner pelo agente.

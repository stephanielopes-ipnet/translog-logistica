# Mensagem para Matheus de Dados

Matheus, fizemos uma revisão local de todas as 180.519 linhas e 41 colunas da Silver que recebi em 13/11. A base tem 65.752 pedidos e está estruturalmente consistente: sem chaves pedido/item duplicadas, sem falhas de leitura e com os campos de pedido iguais entre seus itens. Bruto = quantidade × preço e lucro total = soma dos itens também conferem.

Antes de fechar a integração, seguem os ajustes e confirmações:

1. **Cidades:** há seis grafias com `?`, em 130 itens/38 pedidos. Sete desses itens têm também U+0092, um caractere de controle, em `Cox\u0092s B?z?r`. Exemplos: pedido/item 28324/70867 e 41990/104822. Podemos recuperar as grafias no Bronze e regenerar rota/resumo?
2. **Coordenadas/origem:** uma triagem ampla sinalizou 825 itens/290 pedidos para revisão. Exemplo 4451/11139: origem informada Porto Rico, coordenadas 29.93087578, -81.33435059. Isso é triagem, sem geocodificação. A reunião discutiu retirar coordenadas; existe uma Silver mais nova? Também preciso do significado exato de `origem_cliente_*` para não tratar endereço de cliente como ponto de despacho. A sede em Porto Rico fica como contexto que você informou ao grupo.
3. **Status e atraso:** os 79.510 vazios de atraso/flag seguem a exclusão de não avaliados/cancelados; devemos preservá-los. Pode confirmar as regras PROCESSING → Em Trânsito e SUSPECTED_FRAUD → Cancelado? Os atrasados incluem pedidos Em Trânsito, não só entregas concluídas.
4. **Datas/Same Day:** 9.737 itens têm intervalo de 12 horas, mas dias reais 0 ou 1 conforme viram a data UTC. A previsão é pedido + dias programados. Precisamos documentar se o prazo vale por dia de calendário ou por hora e o que exatamente `data_envio` representa.
5. **Valores:** 4.613 itens têm líquido 0,01 acima de bruto − desconto, diferença acumulada de 46,13. Pode ser arredondamento; confirmar precisão/ordem do cálculo e moeda. As margens também são compatíveis com arredondamento independente, sem erro comprovado.
6. **BI:** `lucro_total_pedido` está correto, mas se repete por item. Vamos agregar por pedido ou somar `lucro_item`. Somar os totais repetidos daria 13.758.404,49 em vez de 3.966.902,97. Electronics também aparece em Footwear e Outdoors; conferir a taxonomia caso seja usada nos gráficos.
7. **Texto/histórico:** os dados são de 2015–2018. O resumo usa “Tempo Real de Trânsito” até para não liberados/cancelados e não informa a antiguidade. Precisamos definir essa redação e a data de referência para o agente não sugerir rastreio atual.

Você consegue compartilhar o dicionário/notebook das transformações e confirmar a versão atual? O relatório completo está em `revisao-silver-2026-11-14.md`, com regras, contagens e exemplos. Nenhum dado foi alterado durante a revisão.

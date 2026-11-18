# Ambiguidade do DataCo: retorno de Othon e fonte original

Registro de 15/11/2026. Fonte do alinhamento: mensagens apresentadas por Marco, incluindo resposta atribuída a Othon, encaminhada por Mateus de Dados. Horários citados do grupo em 15/11; número de telefone omitido. O assistente não consultou nem enviou mensagens ao WhatsApp.

## 1. O que Othon orientou, conforme o trecho apresentado

Primeiro, procurar documentação/tabelas explicativas do dataset ou referências que esclareçam a nomenclatura. Se a dúvida não for resolvida, o grupo pode seguir a abordagem proposta, justificando a interpretação adotada para despacho e o uso de simulação.

Isso é uma autorização condicionada à investigação e à justificativa. **Não é confirmação de que `Days for shipping (real)` significa tempo até o despacho.** Não substitui a aprovação geral de cenário internacional/simulação já relatada por Marco; acrescenta uma orientação específica sobre essa interpretação.

Mateus informou que não encontrou documentação e que as fontes consultadas eram interpretações de outras pessoas. Isso registra o resultado da busca dele até aquele momento, não prova inexistência de qualquer dicionário dos autores.

## 2. Fonte original localizada nesta conferência

Publicação dos autores: Constante, Fabian; Silva, Fernando; Pereira, António (2019), **DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS**, Mendeley Data, versão 5, DOI `10.17632/8gx2fvg2k6.5`, publicada em 12/03/2019.

- [Página original do dataset](https://data.mendeley.com/datasets/8gx2fvg2k6/5).
- [Dicionário original: DescriptionDataCoSupplyChain.csv](https://data.mendeley.com/public-files/datasets/8gx2fvg2k6/files/29dc7b05-dda6-4834-8354-5b5cc44430df/file_downloaded).

A página dos autores informa que o arquivo descritivo acompanha a base. O CSV foi baixado diretamente do domínio Mendeley e lido nesta conferência, sem baixar o dataset completo. Foram lidas 52 linhas de descrição de variáveis; não presumir que o arquivo documente exaustivamente toda exportação. Licença informada na página: CC BY 4.0.

| Campo | Conteúdo relevante do dicionário | Limite de interpretação |
| --- | --- | --- |
| `Days for shipping (real)` | “Actual shipping days of the purchased product” | A definição não explicita os eventos inicial/final da contagem; não resolve sozinha despacho versus chegada ao cliente |
| `Days for shipment (scheduled)` | A descrição usa a expressão de dias programados de entrega do produto | Essa redação não fornece uma data efetiva de chegada nem define todos os eventos da operação |
| `Shipping date (DateOrders)` | Data e hora do envio | Não declara que seja confirmação de entrega ao destinatário |

Os campos com “date” no nome nesse dicionário são a data do pedido e a data de envio. Não há um campo nominal de data de entrega ao cliente nessa lista. A ausência desse campo limita a comprovação de uma entrega, mas **não prova, por si só, qual evento encerra a duração `Days for shipping (real)`**.

Não usar interpretações de terceiros como se fossem definições dos autores. Também não usar a existência deste dicionário breve como se a ambiguidade estivesse resolvida. O dicionário da base original não documenta automaticamente as regras das colunas derivadas da Silver do grupo.

## 3. Relação com a auditoria local

A auditoria da Silver recebida registrou que os dias reais coincidem com a diferença entre as datas de calendário de envio e pedido. Esse resultado reforça a necessidade de esclarecer o significado do evento de envio, mas não comprova que esse timestamp represente entrega ao cliente ou despacho operacional. A revisão do Bronze/notebook e do dicionário de transformação continua necessária para interpretar a Silver.

## 4. Consequência para a entrega

Registrar em separado:

1. O que é campo original do dataset e como foi descrito pelos autores.
2. Qual interpretação operacional o grupo adota, com hipótese e justificativa quando não houver confirmação.
3. Quais eventos foram gerados artificialmente, por quais regras e em qual cenário/data de referência.

No agente, continuar com “dias registrados” e “status informado pela fonte” enquanto a interpretação não estiver validada. Não deduzir data real de entrega somando dias ao pedido. Eventos sintéticos devem aparecer explicitamente como simulação e não entrar nos indicadores históricos como se fossem fatos observados.

O agente pode futuramente consultar pedidos e eventos estruturados, mantendo suas origens. Chroma continua para FAQ/políticas. A aplicação não foi adaptada à nova tabela nem houve escolha de banco nesta etapa.

## 5. Próximo passo de alinhamento

Compartilhar a fonte original com Mateus e, se necessário, Othon, para confirmar se esse dicionário já foi considerado e documentar por que ele ainda não resolve o evento final da duração. Manter a decisão de versão e os dois cenários vinculados ao artefato que Mateus entregar. A palavra “amanhã” na mensagem de 02h51 de 15/11 é uma proposta relativa do remetente, não uma reunião agendada nem decisão já tomada.

Texto possível para Marco enviar:

> Mateus, encontrei na publicação original do DataCo um arquivo com a descrição das colunas. Vou te mandar o link para conferirmos se é o mesmo que você já viu. A descrição dos dias de envio ainda não deixa claro se termina no despacho ou na entrega ao cliente. Acho que podemos usar essa fonte, junto da análise das datas, para registrar a dúvida e justificar a interpretação e a simulação conforme a orientação do Othon.

Nenhuma mensagem enviada pelo assistente. O teste de execução com Matheus FullStack pode prosseguir com a amostra, independentemente desse alinhamento semântico.

## 6. Evidência da consulta

Cópia técnica local, ignorada pelo Git: `.state/referencias-dataco/DescriptionDataCoSupplyChain.csv`, 3.444 bytes, SHA-256 `9828e34669bd6d77e3b4463364cc44a5d52446b5e246fc258758cfe592566c4b`. Metadados de origem em `.state/referencias-dataco/metadados.json`.

O navegador de pesquisa identificou o CSV, mas não conseguiu renderizar seu tipo de conteúdo; a leitura foi feita por download direto do pequeno dicionário. Nenhum dado de pedido, chave, pipeline, índice, servidor ou código do agente foi alterado. Não houve nova inferência ou suíte de testes, por se tratar de pesquisa e documentação.

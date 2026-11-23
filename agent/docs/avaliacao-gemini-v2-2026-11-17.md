# Avaliação Gemini da Silver v2 — 17/11/2026

Marco autorizou explicitamente as duas conversas após o bloqueio inicial de transmissão ao Google. Foram executadas com o modelo configurado `gemini-3.5-flash-lite`, backend `csv_v2`, instrução amigável e corpus técnico local Chroma. A chave foi mantida privada. Cada pergunta iniciou sessão independente em memória, com limite de quatro chamadas LLM e 45 segundos. Nenhum servidor aberto pelo usuário foi alterado.

## Pedido 1001

Pergunta: “Onde está meu pedido 1001?”

Ferramenta observada: `consultar_pedido`.

Resposta final observada:

> O pedido 1001 consta como entregue em San Lorenzo - Central, no Paraguai, conforme o registro histórico simulado. O último evento registrado foi a entrega realizada em 22 de janeiro de 2015, às 14:20.

Conferência: corresponde ao último evento da exportação v2 e identifica histórico/simulação. Resposta curta e clara, sem GPS ou previsão atual inventados. A pergunta não exigia listar itens, que foram preservados na consulta estruturada. Não houve erro 503 nessa execução.

## Pedido 12 e alteração de endereço

Pergunta: “O prazo de despacho do pedido 12 é o prazo de entrega? Como posso alterar o endereço?”

Ferramentas observadas: `consultar_pedido` e `buscar_faq_e_politicas`.

Resposta final observada:

> O prazo de despacho não é o prazo de entrega. O despacho refere-se à preparação e saída do pedido da expedição, enquanto a entrega é a etapa final de chegada ao destino. No histórico deste pedido, o despacho e a entrega são tratados em prazos e datas separados.
>
> Sobre a alteração de endereço, as ferramentas atuais do assistente servem apenas para consulta e não realizam modificações nos dados do pedido. O procedimento oficial de alteração de endereço ainda depende da revisão das políticas pela equipe.

Conferência: separou despacho de entrega, chamou ambas as ferramentas, não prometeu alterar endereço, encaminhar ou seguir uma política final ainda ausente. Não houve erro 503. **Resultado parcial:** omitiu título/fonte/versão da orientação, exigidos pelo contrato do agente. O relatório do runner registra chamadas e texto público, não uma cópia integral dos retornos Chroma; a recuperação local do corpus foi verificada separadamente.

## Ajuste e limite da evidência

Após observar a omissão, `src/translog/agent_factory.py` foi reforçado com um formato explícito de referência ao usar conhecimento recuperado: título, fonte e versão do trecho de apoio. Não criar citação se o trecho não sustentar a resposta.

**Não foi executada nova inferência após esse reforço.** As duas conversas autorizadas já haviam sido concluídas. O efeito da nova instrução nas citações continua pendente de reavaliação; testes técnicos não comprovam essa redação do Gemini.

Evidência local original: `.state/evaluation-gemini-v2-2026-11-17.json`. Não houve publicação no GitHub. Duas execuções sem 503 não garantem disponibilidade para a apresentação. Banco/SQL, políticas finais, integração com o portal, contingência para 503 e avaliação integral continuam pendentes.

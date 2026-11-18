# Integração da Silver v2 e FAQ — plano de execução

Solicitação: Marco pediu continuar a integração dos dados entregues por Mateus e da FAQ de Stephanie. Execução local nesta pasta, sem publicação ou escolha de banco por inferência.

## Decisões técnicas

- Preservar os três CSVs recebidos em `data/silver/v2-2026-11-17`, ignorados pelo Git; não alterar a versão de 13/11.
- Adicionar backend explícito `csv_v2`, com pedidos, itens e eventos em consulta estruturada. Manter `csv` e `sql_pending`. Não transformar essa implementação em SQL concluído.
- Retornar dados mínimos de um único pedido, todos os seus itens e eventos ordenados. Separar atraso de despacho e entrega; preservar negativos e nulos. Rastreio é histórico com complemento simulado, referido a 06/02/2018, nunca GPS atual.
- Não usar resumos textuais derivados como substitutos dos campos estruturados. Não enviar identificador/perfil do cliente, valores financeiros ou origem residencial ao modelo.
- FAQ recebida é v1 “para revisão”. Preparar conteúdo e relatório de conflitos; não publicar regras pendentes como aprovadas. Pergunta de status da revisão enviada a Marco enquanto a integração avança.

## Tarefas

- [x] Extrair com nomes permitidos, preservar originais e auditar integralmente contagens/chaves/relações/datas/último evento. Evidência: `.state/audit-silver-v2-2026-11-17.json`.
- [x] Escrever testes com três tabelas controladas para nulos/negativos, diferença despacho/entrega, múltiplos itens, eventos ordenados, fonte ausente, duplicatas, referências futuras e privacidade; observar falha antes da implementação.
- [x] Implementar `ConsumptionCsvRepository.read_order(code)` em `src/translog/consumption.py`, integrar `Settings`, ferramentas e CLI sem alterar assinatura pública `consultar_pedido(order_id)`.
- [x] Preparar a FAQ com fonte/versão/estado e documentar conflitos; preservar original como rascunho e indexar somente oito orientações técnicas com revisão local explícita, sem aprovar regras comerciais pendentes. Recuperação Chroma real verificada separadamente de inferência Gemini.
- [x] Ativar a fonte local somente após validar casos da exportação, preservando chave/modelo da `.env`; registrar contrato e reprodução para FullStack.
- [x] Rodar suíte completa, consultas reais sem LLM e revisão final; atualizar status/decisões/retomada. 49 testes passaram; nove pedidos e quatro buscas aceitos. Revisão independente concluída e achados corrigidos. Avaliação Gemini bloqueada por revisão automática de transmissão de dados ao Google; aguarda autorização explícita. Portal/GitHub/SQL não foram presumidos concluídos.

## Registro de revisão

Complemento: Marco autorizou posteriormente as duas chamadas Gemini; ambas executadas sem 503. Pergunta mista omitiu citação, motivando reforço da instrução. Nenhuma chamada adicional após esse ajuste. Ver `docs/avaliacao-gemini-v2-2026-11-17.md`; a avaliação integral e o efeito do reforço não foram declarados aprovados.

Revisor independente confirmou corrigidos: suporte à diferença negativa de entrega (pedido real 12) e validação integral da unicidade de último evento/cronologia. Ambos reproduzidos em testes antes da correção; suíte final passou. Nenhuma inferência Gemini foi executada. Todos os demais limites constam do relatório de integração.

## Riscos a conferir

Mistura de campos de despacho com entrega; localização histórica apresentada como atual; fonte ausente tratada como pedido inexistente; vazamento de colunas pessoais; FAQ em rascunho contradizendo as novas tabelas. Cada um terá validação explícita ou permanecerá registrado como pendência.

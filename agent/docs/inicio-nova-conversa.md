# Retomar o projeto em outra conversa

Estado consolidado em **17/11/2026**. Ler este arquivo junto de `AGENTS.md` e `Agentes.md`; os dois arquivos de instruções têm precedência sobre notas históricas desatualizadas do projeto.

## O que não precisa ser refeito

- Ambiente, dependências e chave Gemini já configurados. Modelo: `gemini-3.5-flash-lite`.
- Fonte já alinhada: `consumo_*` no Databricks; CSVs exportados como alternativa local, sem banco próprio. Agente local usa `csv_v2`; ainda não consulta SQL diretamente.
- Dados recebidos: 65.752 pedidos, 180.519 itens, 350.416 eventos. Fonte local em `data/silver/v2-2026-11-17/`, sem publicar os CSVs completos.
- FAQ fechada pelo grupo, corrigida e indexada: 18 trechos em `knowledge/approved/faq-politicas-v2.json`.
- Atendimento natural ao cliente no cenário da banca, sem repetir avisos técnicos nem fontes/versões em cada resposta. Proveniência mantida nos metadados e explicada se perguntada. Datas originais preservadas; destino não é localização.
- Marco testou e aprovou o tom em seu relato. Não reverter essas decisões nem reabrir aprovação da FAQ.

## Pastas e GitHub

- Pasta local desta conversa: `C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil`.
- Checkout do repositório do grupo: `C:\Users\marco.leal_ipnet\Documents\Codex\translog-logistica`, IA em `agent/`.
- Repositório único: `stephanielopes-ipnet/translog-logistica`, conta `Marco-Leal96`.
- PRs #30 e [#32](https://github.com/stephanielopes-ipnet/translog-logistica/pull/32) integrados. Correção de latência na branch `fix/agente-latencia-consulta`. Conferir remoto antes de agir.
- Versão funcional consolidada publicada em `fdd5f31` em 17/11; FAQ completa, atendimento e guias de testes já sincronizados. Descrição do PR atualizada e 51 testes passaram também no destino. Não repetir a publicação sem novas mudanças; os registros posteriores de documentação podem acrescentar commits ao mesmo PR.
- Marco autorizou manter `AGENTS.md`, `Agentes.md`, documentação e GitHub atualizados com alterações necessárias ao projeto, sem confirmações repetidas para commits/push/PR dentro desse escopo. Não publicar segredos, dados privados, caches, índices ou ambiente virtual.
- Escritas pelo conector GitHub retornaram 403; Git local já autenticado foi usado para push. PR criado pelo navegador e verificado pelo conector. Não trocar de conta ou criar remoto alternativo por isso.

## Testar sem reiniciar o projeto

Interface local: **http://127.0.0.1:8003**, agente `translog_agent`. Verificar se o processo está ativo; não encerrar a porta 8001 antiga sem motivo. Depois de reiniciar a instância dedicada, atualizar a página e usar **New Session**. Sessões de teste são em memória.

Última suíte antes da publicação desta consolidação: **51 testes passaram**, 10 avisos. Conferir registro mais recente em `docs/status-implementacao.md` e repetir somente quando necessário. Não chamar Gemini automaticamente só para comprovar que a documentação existe.

Perguntas/casos para testar e apresentar: [casos-teste-e-apresentacao-agente.md](casos-teste-e-apresentacao-agente.md). Resultados esperados dos CSVs: [roteiro-testes-silver-v2-faq.md](roteiro-testes-silver-v2-faq.md). O 1001 da v2 tem quatro linhas e 14 unidades, entregue no prazo; não usar o 1001 da amostra antiga.

## Próximo foco de trabalho

Em 19/11, adicionada indexação em memória à consulta `csv_v2` para evitar reler os três arquivos a cada pergunta. Primeiro pedido carrega a exportação no processo do ADK. Medição local da ferramenta: 5,7 s com carga e menos de 4 ms por consulta seguinte. Portal e Gemini ainda precisam ser medidos juntos. Ver [estado da implementação](status-implementacao.md).

Marco esclareceu nesta retomada de 17/11 que já testou uma integração anterior com Matheus, **mas ainda não a Silver v2 e a FAQ atual no portal**. Roteiro atualizado em [guia-matheus-fullstack.md](guia-matheus-fullstack.md), com configuração dos dois processos, mesmos CSVs, teste de contexto/FAQ/sessões e falha de conexão. Evidências e pendências em [aceite-portal-v2-2026-11-17.md](aceite-portal-v2-2026-11-17.md). Não tratar o relato anterior como aceite desta versão nem voltar ao guia antigo do PR #30/amostra.

Registrar os casos manuais e testar a versão atual com Matheus FullStack no fluxo **portal → backend → ADK**, com a mesma v2 e FAQ na máquina da demo. Verificar continuidade, código do pedido aberto, orientação da FAQ e mensagens de falha. Contingência 503 permanece sem implementação; não confundir isso com erro dos dados. Consultar `docs/status-implementacao.md` e `docs/decisoes.md` para evidências.

## Mensagem para colar na nova conversa

> Continue o projeto TransLog a partir do estado salvo. Leia AGENTS.md, Agentes.md e docs/inicio-nova-conversa.md, depois consulte docs/status-implementacao.md, docs/decisoes.md e docs/plano-projeto.md. O agente já usa Silver v2 e FAQ fechada com atendimento natural ao cliente; fontes/versões ficam nos registros técnicos. A fonte do projeto já é Databricks, com CSV local como alternativa. Estou testando os casos de docs/casos-teste-e-apresentacao-agente.md. Retome pelo próximo passo registrado, sem refazer onboarding ou reabrir decisões. Mantenha os arquivos de orientação e o GitHub atualizados conforme minha autorização registrada.

Não é necessário copiar toda a conversa antiga. Caso uma informação específica não esteja nos arquivos, consultar o registro correspondente ou pedir apenas esse detalhe. Não presumir que um novo chat já leu todo o histórico anterior.

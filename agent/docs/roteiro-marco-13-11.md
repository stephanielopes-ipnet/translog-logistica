# Roteiro de Marco — 13/11/2026

Objetivo: aprender a executar a entrega de IA no VS Code, integrar o trabalho ao repositório do grupo e validar a Silver sem assumir decisões pendentes. Este roteiro aplica os acordos de `Agentes.md`; não muda o banco nem o contrato da API.

## 1. O que foi conferido

- Conta do conector GitHub: `Marco-Leal96`, confirmada por consulta autenticada. Permissões de leitura e envio de código confirmadas no repositório; nenhum envio realizado. A conta do Git/VS Code local precisa ser conferida separadamente antes de publicar.
- Repositório: https://github.com/stephanielopes-ipnet/translog-logistica. Branch padrão `main`. Inspeção dos arquivos no commit `2acdd81b3fb1ed05e058d3f6f39e622d84f508cb`.
- A pasta do grupo para a IA é `agent/`. No commit inspecionado, contém apenas um README. A base funcional desta pasta local ainda não está integrada ao repositório do grupo.
- Uma cópia com Git foi baixada apenas para inspeção em `.state/repo-grupo`, sem checkout dos arquivos. Não abrir essa pasta como ambiente de desenvolvimento.
- Silver recebida: `silver_pedidos_rastreio.csv`; cópia local em `data/silver/`, byte a byte igual à recebida. O original em Downloads foi preservado.
- SHA-256: `133B31DDCCCF7358B00870FAA1E89B99A9FDBA88E6AE83A85BDD0F5FD55D409C`.
- Diagnóstico local: Python 3.12.14; consulta ativa ainda usa amostra; chave Gemini não configurada; índice de conhecimento revisado ausente.
- Marco não sabe se existe dicionário ou decisão posterior sobre banco/API. Registrar como não confirmado, sem tratar a ausência de informação como decisão.

## 2. O que a inspeção da Silver demonstrou

Leitura local completa com parser CSV, sem enviar o arquivo ao modelo. Contagens de linhas são contagens de itens, não de pedidos.

| Verificação | Resultado observado |
| --- | --- |
| Tamanho | 162.957.607 bytes, aproximadamente 155,4 MiB |
| Formato | CSV separado por vírgula; leitura completa com `utf-8-sig` |
| Colunas | 41 |
| Linhas de itens | 180.519 |
| Pedidos distintos | 65.752 |
| Pedidos com vários itens | 45.902 |
| Máximo de itens por pedido | 5 |
| Repetições de `(id_pedido, id_item_pedido)` | Nenhuma detectada |
| Linhas com atraso declarado vazio | 79.510 |
| Atraso declarado negativo | 24.314 linhas, classificadas como adiantadas |

Nas 101.009 linhas com `dias_atraso` preenchido, o valor coincide com `dias_envio_real - dias_envio_programado`, incluindo valores negativos. As 79.510 linhas sem avaliação de atraso estão classificadas como `Não Avaliado` (71.756) ou `Cancelado` (7.754). Os campos numéricos de dias continuam preenchidos nessas linhas.

Isso não comprova erro na Silver: demonstra que sua regra de avaliação difere do cálculo genérico da amostra. A consulta atual calcula `max(actual_days - scheduled_days, 0)` sempre que há dias válidos. Apenas trocar nomes de colunas não garante respostas corretas para a Silver.

Exemplos para conferir com Dados; são registros históricos do dataset, não entregas operacionais da TransLog:

| Pedido/item | Observação no arquivo |
| --- | --- |
| 12 / 34 | `Adiantado`, diferença -1; pedido 12 tem cinco itens |
| 18 / 55 | `No Prazo`, diferença 0 |
| 38 / 101 | `Atrasado`, diferença 2; situação `Em Trânsito` |
| 16 / 48 | `Não Avaliado`, atraso vazio, embora os dias estejam preenchidos |
| 552 / 1382 | `Cancelado`, atraso vazio |

Nomes candidatos para discutir: `order_id` ← `id_pedido`; `order_item_id` ← `id_item_pedido`; `scheduled_days` ← `dias_envio_programado`; `actual_days` ← `dias_envio_real`. Não foi publicado um mapeamento de produção. Confirmar também qual status apresentar e o significado de datas, coordenadas e `situacao_rastreio`.

Não usar `resumo_rastreio_rag` como política oficial nem como substituto da consulta exata. A origem e a lógica de geração desse texto ainda precisam ser explicadas por Dados. Coordenadas não comprovam localização de veículo.

## 3. Pontos para alinhar na issue #1

Referência: https://github.com/stephanielopes-ipnet/translog-logistica/issues/1.

| Assunto | Base local | Texto encontrado no GitHub | Próximo passo |
| --- | --- | --- | --- |
| Banco | Aguardando decisão do grupo | Arquitetura cita DuckDB | Confirmar se é proposta ou escolha aprovada |
| Fonte | Silver recebida para desenvolvimento | Arquitetura descreve Gold/Parquet | Combinar a fonte inicial e o contrato da fonte final |
| Chat | API nativa ADK, com adaptação no backend | Arquitetura e issue #17 citam `/chat` | Definir quem oferece `/chat` e como chama o ADK |
| Atraso | Não negativo; nulos desconhecidos | Silver usa diferença com sinal e avaliação por status | Confirmar quando atraso se aplica e como representar adiantamento |
| Afirmações | Sem causa ou GPS inventados | README menciona responder por que atrasou | Limitar a resposta às evidências disponíveis |

Texto sugerido para Marco enviar; nenhuma mensagem foi enviada pelo assistente:

> Recebi a Silver e comecei a validação. Ela tem 180.519 itens e 65.752 pedidos, então vou preservar todos os itens de cada pedido. Vocês têm o dicionário e a regra de geração das colunas? No pedido 16/item 48 há dias preenchidos, mas atraso não avaliado; no pedido 12/item 34 o atraso é -1 (adiantado). Preciso confirmar como o agente deve apresentar esses casos. Também vi DuckDB e /chat na arquitetura: foram aprovados ou são propostas? Podemos fechar na issue #1 a fonte inicial/final, o banco e quem adapta a API do ADK para o portal?

## 4. Primeiro bloco no VS Code: entender o que já funciona

Abra **Arquivo → Abrir Pasta** e selecione a pasta atual `C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil`. Em **Terminal → Novo Terminal**, use PowerShell. Execute um comando por vez:

```powershell
Set-Location 'C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil'
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli order 1004
.\.venv\Scripts\python.exe -m pytest tests/test_orders.py -q
```

Resultado esperado: diagnóstico sem segredos; 1001 com atraso observado de dois dias; 1004 com dois itens; testes terminam com `passed`. Esses IDs são da amostra, não os casos de verificação da Silver.

Aprendizado: ferramenta é uma função que busca evidência; teste confere situações conhecidas; ambiente `.venv` guarda as dependências locais. Leia `src/translog/agent_factory.py` e identifique as instruções e a lista de ferramentas.

## 5. Clonar o repositório para trabalhar com o grupo

Preserve a pasta atual. No VS Code, **Ctrl+Shift+P → Git: Clone**; cole a URL do repositório e escolha `C:\Users\marco.leal_ipnet\Documents\Codex` como pasta pai. O clone deverá ficar em `C:\Users\marco.leal_ipnet\Documents\Codex\translog-logistica`, ao lado da pasta atual. Se já existir, confira antes de reutilizar; não sobrescreva.

Abra a pasta clonada. Confira `CONTRIBUTING.md`. Na raiz desse clone, execute:

```powershell
git status
git remote -v
git branch --show-current
```

Resultado esperado: árvore limpa; `origin` aponta para `stephanielopes-ipnet/translog-logistica`; branch `main`. Antes de publicar, confira também se a sessão GitHub do VS Code é `Marco-Leal96`; o conector autenticado não troca automaticamente o login do editor.

Crie uma branch pelo VS Code, **Ctrl+Shift+P → Git: Create Branch**, por exemplo `feat/agente-base-adk`. Ela separa a contribuição em andamento da versão compartilhada.

Na primeira integração, concentrar a aplicação em `agent/`, preservando os arquivos de gestão e as pastas dos colegas. A base Python local pode ser organizada dentro de `agent/`, com seu README, configurações, testes e dependências. Conferir caminhos e instruções após mover; não copiar toda a pasta atual sobre a raiz do repositório. Recriar `.venv` no destino, sem copiar ambientes instalados.

Não presumir que o clone já tem os comandos da base local: no commit inspecionado, o código ainda não estava lá. A primeira contribuição precisa levá-lo e provar sua execução no destino.

## 6. Primeiro marco: issue #6, agente respondendo

Tarefa: https://github.com/stephanielopes-ipnet/translog-logistica/issues/6. A issue menciona Marco no texto, mas ainda não tem assignee na inspeção; combinar a atribuição com Stephanie.

Obter chave no Google AI Studio: https://aistudio.google.com/apikey. Guardar na `.env` local em `GOOGLE_API_KEY`; confirmar modelo e acesso antes da conversa. Não há chave configurada no diagnóstico de 13/11. A execução é local, mas o Gemini nessa configuração é acessado pela internet.

Na base atual, após configurar o acesso:

```powershell
.\.venv\Scripts\adk.exe web agents --port 8001 --no_use_local_storage
```

Abra http://127.0.0.1:8001, selecione `translog_agent` e pergunte pelo pedido 1001. Verifique chamada a `consultar_pedido`, resposta coerente e identificação da amostra. Registre modelo, fonte e resultado. Captura de tela sem chaves ou configuração privada. A página aberta sozinha não comprova resposta do modelo.

Encerrar com Ctrl+C. O comando acima parte da raiz atual; depois da integração, conferir o diretório indicado no README de `agent/`.

## 7. Próximos marcos e evidências

| Etapa | Issue | Evidência de qualidade |
| --- | --- | --- |
| Acordar dados e API | #1 | Significado dos campos, nulos, fonte e interface aprovados pelo grupo |
| Primeiro agente | #6 | Uma conversa real, ferramenta chamada e origem identificada |
| Consulta da fonte conferida | #15 | Casos atrasado, pontual, adiantado, cancelado/não avaliado, múltiplos itens e inexistente |
| FAQ e políticas no Chroma | #16 | Conteúdo revisado com fonte/versão; exemplos separados |
| Chat para o portal | #17 | Formato acordado e teste na máquina da demo |
| Avaliação | #18 | Dez perguntas com resposta esperada e obtida, inclusive limitações |

Não marcar SQL concluído usando CSV. Não marcar conversa aprovada apenas por teste sem Gemini. A Silver ajuda a desenvolver; não comprova origem operacional real, causa de atraso ou rastreio ao vivo.

## 8. Publicar uma contribuição revisável

O `CONTRIBUTING.md` do grupo pede branch `feat/<area>-<descricao>`, commit `tipo(area): descrição` e PR ligado à issue. Exemplo: `feat(agente): adiciona base local do ADK`. Usar `Closes #6` apenas se os critérios dessa issue estiverem realmente cumpridos.

Antes do commit, revisar arquivos no Controle do Código-Fonte. Confirmar que não entram `.env`, `.venv`, caches, índice local ou Silver completa. O `.gitignore` do grupo ainda não ignora expressamente este nome de CSV nem todos os derivados desta base; preparar as exclusões junto com a integração antes de colocar os dados na pasta clonada.

O CSV tem mais de 100 MiB, limite por arquivo do GitHub em Git comum: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github. Manter a fonte fora do Git e combinar distribuição/versão com Dados.

Registrar commit, publicar a branch, abrir PR com o que mudou e como foi verificado, pedir revisão. Depois da integração, os colegas recebem o código com pull e preparam seus ambientes e dados locais.

## 9. Como dividir duas horas hoje

1. 15 min: alinhar os pontos da issue #1 e a tarefa #6.
2. 20 min: abrir a base no VS Code e entender diagnóstico/consulta.
3. 20 min: clonar o repositório, conferir conta e criar branch.
4. 40 min: acesso ao modelo e primeira conversa, ou trabalho independente se acesso bloquear.
5. 25 min: registrar evidência, limitações e próximos passos; revisar a integração inicial.

Se uma etapa exceder o tempo, terminar o bloco com feito/próximo/bloqueio. Seguir o acordo local de avisar o responsável e Stephanie após 30 minutos bloqueado. Não é necessário concluir Silver, Chroma, SQL, API e portal no primeiro dia.

# Integração dos dados de Mateus e FAQ — 17/11/2026

**Atualização posterior:** Marco autorizou as duas conversas com Gemini e ambas foram executadas sem 503. Rastreio 1001 correto; pergunta mista 12 acionou consulta e Chroma e respeitou limites, mas omitiu citação. Prompt reforçado, sem reavaliação generativa posterior. Ver [avaliação e respostas](avaliacao-gemini-v2-2026-11-17.md). As notas de bloqueio inicial neste relatório são históricas e foram superadas pela autorização para essas duas chamadas.

## Entrega recebida e conferida

Arquivo fornecido por Marco: `silver_v2-20261117T173615Z-1-001.zip`. Foram extraídos somente os três nomes esperados, sem executar conteúdo do pacote. Originais preservados em `data/silver/v2-2026-11-17/`, ignorados pelo Git. A Silver de 13/11 não foi alterada.

| Tabela | Linhas | Grão / chave |
| --- | ---: | --- |
| `consumo_pedidos.csv` | 65.752 | Um pedido / `id_pedido` |
| `consumo_itens_pedido.csv` | 180.519 | Um item / (`id_pedido`, `id_item_pedido`) |
| `consumo_eventos_logisticos.csv` | 350.416 | Um evento / (`id_pedido`, `sequencia`) |

O pacote se identifica como **Silver v2**, não como Gold. São tabelas de consumo; isso não confirma banco, pipeline Gold ou implantação SQL. Todos os pedidos têm `data_referencia_base=2018-02-06`. Há 45.902 pedidos com mais de uma linha de item. `qtd_itens` é soma de unidades, não quantidade de linhas de itens.

Auditoria integral: chaves duplicadas, registros malformados, relações órfãs, ausência de itens/eventos, soma de unidades, datas posteriores à referência, correspondência do último evento, unicidade do marcador final e cronologia dos eventos. Nenhum problema detectado nessas verificações na entrega. Isso não certifica a metodologia de geração das simulações ou o pipeline não fornecido.

Foram preservados 28.886 nulos de atraso de despacho e 36.108 de entrega. Existem 8.892 diferenças negativas no despacho e 7.079 na entrega: significam adiantamento, sem convertê-las em atraso positivo ou zero. Marco confirmou em 17/11: **4/2/1 dias são prazos de despacho, não de entrega**. Não há confirmação de calendário de dias úteis/corridos.

SHA-256 dos CSVs:

```text
consumo_pedidos.csv             c0cf3d5d2ccbce320e7bc45f16a800ac98b2d7c3699b1205968be65ad56b50ee
consumo_itens_pedido.csv        fb874ac56d1e499f096c977593c637a0ab6ed5164d47c02e2de2e8df00282b53
consumo_eventos_logisticos.csv  49e9ffd1339bdcfd1c44fcd2bec93bf8502bc7db55a379dea99dea1c773b6145
```

Relatório detalhado local em `.state/audit-silver-v2-2026-11-17.json`. Script reexecutável: `scripts/audit_silver_v2.py`. Ainda falta dicionário versionado de Mateus que detalhe a origem de cada campo e as regras dos cenários. Entrega, eventos, locais, modais e ocorrências são tratados conservadoramente como complemento simulado, sem apresentá-los como observações operacionais reais.

## Consulta implementada e ativada

Backend explícito `csv_v2`, sem alterar as opções `csv` (contrato de desenvolvimento anterior) e `sql_pending`. A `.env` local foi atualizada somente nos parâmetros de fonte/conhecimento; modelo e credencial foram preservados. Não há fallback silencioso entre bases.

`consultar_pedido(order_id)` mantém nome e argumento. Seu resultado v2 contém:

- `status`: `found`, `not_found`, `invalid_input` ou `unavailable`.
- `order_id`: código em texto, com zeros preservados.
- `order`: situação geral, data de referência, destino, classe de serviço, modal do cenário, último evento/local; `dispatch` e `delivery` separados.
- `order.dispatch.signed_delay_days` e `order.delivery.delay_days`: diferenças com sinal ou nulo. Valores negativos são adiantamento na respectiva etapa.
- `items`: todos os itens, com código, nome do produto e quantidade. A fonte não oferece situação individual de entrega por item.
- `events`: sequência, código/descrição, etapa, instante, local e marcador do último evento. Ordenados por sequência, com cronologia e referência histórica verificadas.
- `source`: backend, origem/versão, `is_historical=true`, `is_simulated=true` e explicação da combinação de história com simulação. Data do arquivo não é data do evento.

Não retornam ao modelo: identificador/perfil de cliente, origem residencial, valores financeiros, `resumo_pedido`, `linha_do_tempo` nem o CSV completo. Fonte ausente, chave duplicada ou inconsistência no pedido consultado gera `unavailable`, sem inventar inexistência.

Cada consulta percorre os CSVs, mantendo em memória somente os registros do pedido solicitado. O aceite inicial mediu aproximadamente 5–7 segundos por consulta neste ambiente, antes da inferência do modelo. Não representa GPS nem desempenho de uma implantação SQL.

## FAQ recebida e limite da revisão

Fonte: [FAQ e políticas de Stephanie](https://docs.google.com/document/d/1BgObjdR48RB3cEIo3_h9C8GrWxOEEZLzpv9Fb7M_ZP4/edit?tab=t.0), lida por exportação do navegador autenticado após indisponibilidade do conector. Não foi editado o documento original. Cópia recebida em `knowledge/drafts/faq-stephanie-v1-2026-11-17.md`.

O título declara **“versão 1 (para revisão)”** e o início lista “Pontos para decidir”. A autoria de Stephanie e o envio por Marco não foram tratados como aprovação final de todas as regras.

| Ponto encontrado | Tratamento nesta integração |
| --- | --- |
| 4/2/1 dias descritos como entrega | Corrigido no corpus técnico local para despacho, conforme confirmação explícita de Marco. Original preservado. |
| “Aguardando liberação” com mapeamento pendente | Não criar um mapeamento. Usar a situação presente no pedido. |
| Central em dias úteis 9h–18h, assistente 24h e atraso crítico de 3 dias | Permanecem fora do corpus ativo até confirmação/revisão; não são disponibilidade ou política implementadas. |
| Encaminhamento automático e retorno no próximo dia útil | Não prometidos: as ferramentas não executam encaminhamento/notificação. |
| Causa provável baseada em histórico de rota | Não atribuir esse método à nova base sem evidência; apenas reportar causa registrada como parte da simulação. |
| Status distintos por item | Não inventar: o arquivo de itens não tem status logístico próprio. |
| Prazos começando no pedido versus liberação | Não adotar regra conflitante; usar as datas registradas e reconhecer a pendência de calendário/definição. |

Foram produzidos **oito textos de orientação técnica local**, identificados como material do projeto acadêmico em título, fonte, versão e revisão. Cobrem rastreio, despacho versus entrega, diferenças com sinal/nulos, limites de alteração/cancelamento, pedido não encontrado, vários itens e dados pessoais. `approved_by` identifica explicitamente a revisão técnica do assistente, sem atribuir aprovação comercial a Stephanie. Não se aprovou o rascunho inteiro para preencher um índice.

Corpus ativo: `knowledge/approved/orientacoes-tecnicas-v2.json`. Índice Chroma real, oito documentos, revisão `14b9e4e37aa7cf114f87`, separado dos exemplos `demo`. No índice, `is_simulated=false` indica modo revisado em vez de corpus demo; **não significa que a empresa ou os fatos logísticos sejam reais**. Cada texto explicita o contexto acadêmico; a consulta de pedidos identifica suas próprias simulações.

Quatro buscas com embeddings locais recuperaram o documento esperado entre os três primeiros: prazo de despacho/entrega, alteração de endereço, dados pessoais e indenização automática. Isso comprova recuperação técnica, não avaliação integral das respostas Gemini nem políticas comerciais finais.

## Casos conferíveis na fonte nova

| Pedido | Resultado observado sem LLM |
| --- | --- |
| `1` | Extraviado no cenário; despacho adiantado em 2 dias; atraso de entrega ausente. |
| `2` | Não pago (expirado); atrasos não avaliados. |
| `4` | Entregue com atraso no cenário. |
| `7` | Entregue no prazo, apesar de despacho com diferença de +1 dia. |
| `12` | Entregue no prazo, com entrega adiantada em 1 dia (diferença -1). |
| `50` | Cancelado; atrasos não avaliados. |
| `76380` | Em trânsito na referência histórica, não em trânsito hoje. |
| `77132` | Aguardando pagamento; atrasos ausentes. |
| `1001` | Quatro linhas de itens; entrega registrada no cenário em 22/01/2015, no prazo. |

O pedido `1001` antigo da amostra (4/6 dias, dois de atraso) não é o `1001` desta base. Abrir nova conversa após reiniciar o ADK para evitar misturar as fontes no histórico.

## Reprodução e integração com FullStack

Na raiz local, ou na pasta `agent` quando esta versão for sincronizada ao repositório do grupo:

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli validate-orders
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli search 'O prazo de despacho é o prazo de entrega?'
```

Para outra máquina: copiar privadamente os três CSVs, usar `TRANSLOG_ORDER_BACKEND=csv_v2`, `TRANSLOG_DATA_ORIGIN=silver`, `TRANSLOG_CONSUMPTION_DIR=data/silver/v2-2026-11-17` e `TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false`. Recriar o índice com `python -m translog.cli index --input knowledge/approved`. Não compartilhar `.env`, índices ou ambiente virtual pelo Git.

O HTTP continua nativo ADK, com as mesmas rotas de sessão e `/run`. A API também foi testada com ferramenta real v2 e modelo determinístico. Se o backend do portal inspecionar eventos de ferramenta, deve considerar o objeto `order` v2; o texto final continua extraído com `extract_final_text`.

Nenhum servidor do usuário foi reiniciado. Para carregar instrução e fonte novas no ADK Web, encerrar o teste atual, reiniciar o processo da pasta alterada e abrir nova conversa. Sessões em memória são descartadas no reinício.

## Limites restantes

- Suíte técnica atual: 49 testes passaram; 10 avisos de depreciação. Evidência local `.state/test-results-silver-v2.xml`.
- Avaliação Gemini real não executada: revisão automática rejeitou a chamada porque transmitiria ao Google os dados mínimos consultados de pedidos/itens/locais e orientações. Script preparado `scripts/evaluate_agent_v2.py`; depende de autorização explícita para essa transmissão. Não houve tentativa por outro caminho.
- As duas perguntas preparadas são “Onde está meu pedido 1001?” e “O prazo de despacho do pedido 12 é o prazo de entrega? Como posso alterar o endereço?”. Não são resultados aprovados.
- Alta demanda/503 do Gemini continua risco externo; retries, modelo reserva e contingência do portal ainda não foram implementados.
- Banco/SQL, revisão final das políticas, portal na máquina do FullStack, publicação no GitHub e avaliação integral continuam separados desta entrega local. Não há declaração de conclusão de todo o projeto.

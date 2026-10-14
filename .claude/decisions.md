# Decisões de arquitetura

## Comunicação só por eventos (sem banco compartilhado)
**Contexto:** o worker precisa informar o resultado do pagamento.
**Decisão:** o worker publica `charge.succeeded`/`charge.failed`; só a API escreve no Postgres.
**Descartadas:** worker gravando no banco da API (acopla schema e deploy); callback HTTP (acopla disponibilidade e perde a mensageria na volta).

## Transactional outbox
**Contexto:** gravar a cobrança e publicar o evento não pode divergir.
**Decisão:** evento gravado na tabela `outbox` na mesma transação; relay publica com publisher confirms e marca `published_at`.
**Consequência:** entrega at-least-once — consumidores precisam ser idempotentes (`processed_events` na API, Redis no worker).
**Descartada:** publicar direto no RabbitMQ após o commit (perde o evento se o processo cair entre os dois passos).

## Topologia do RabbitMQ em `definitions.json`
**Decisão:** exchanges, filas, DLQs e bindings declarados na infraestrutura, não no código dos serviços.
**Motivo:** um lugar só para ver o fluxo; serviços não brigam por argumentos de fila diferentes.

## Retry com fila de TTL em vez de plugin de delayed message
**Decisão:** `worker.charge-created.retry` com `x-message-ttl` e dead letter de volta para `charge.created`.
**Motivo:** funciona com RabbitMQ puro; o plugin delayed-message não vem na imagem oficial.

## TypeORM em vez de Prisma
**Motivo:** padrão da documentação do NestJS e suporte a `FOR UPDATE SKIP LOCKED` no query builder, usado pelo relay.

## Conexão RabbitMQ crash-only na API
**Decisão:** se a conexão cair fora do shutdown, o processo encerra com código 1 e o Docker reinicia.
**Motivo:** reconectar e reassinar consumidores corretamente é complexo; reinício limpo é previsível.

## Gateway simulado determinístico
**Decisão:** o resultado depende dos dois últimos dígitos de `amount_cents` (13 recusa, 99 erro transitório).
**Motivo:** permite testar sucesso, falha e DLQ de forma reproduzível no `scripts/smoke.sh`.

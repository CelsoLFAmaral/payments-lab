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
**Desligamento:** o subscriber cancela o consumer e espera os handlers em andamento em `beforeApplicationShutdown`; as conexões só fecham em `onApplicationShutdown`, que o Nest chama depois. Consumer cancelado pelo broker fora do desligamento também encerra o processo. Falha em `ack`/`nack` só é logada: a mensagem volta para a fila e a reentrega é deduplicada por `event_id`.

## Gateway simulado determinístico
**Decisão:** o resultado depende dos dois últimos dígitos de `amount_cents` (13 recusa, 99 erro transitório).
**Motivo:** permite testar sucesso, falha e DLQ de forma reproduzível no `scripts/smoke.sh`.

## Alternate exchange para eventos sem rota
**Contexto:** publicação sem `mandatory` numa exchange sem fila de destino é confirmada pelo broker e descartada; o relay marcaria o evento como publicado e ele sumiria.
**Decisão:** a exchange `payments` tem `alternate-exchange: payments.unroutable` (fanout) ligada à fila `payments.unroutable`. Evento sem rota fica estacionado para inspeção, sem mudança no publisher.
**Descartada:** `mandatory` + `basic.return` — o return chega de forma assíncrona e teria de ser correlacionado com o lote confirmado pelo relay, para no fim fazer o mesmo: guardar a mensagem em algum lugar.

## Quorum queue com delivery-limit nos resultados
**Contexto:** no consumo de `api.charge-results`, erro não classificado faz `nack(requeue=true)`; sem limite, uma mensagem que sempre falha fica em loop quente para sempre.
**Decisão:** `api.charge-results` é quorum queue com `x-delivery-limit: 5`. O subscriber continua devolvendo transitórios para a fila; depois de 5 reentregas o broker manda a mensagem para `api.charge-results.dlq` (`x-death.reason = delivery_limit`).
**Descartada:** fila de retry com TTL, como no worker — mais peças (fila extra, cabeçalho de tentativas, republicação) para um consumidor que só faz I/O no próprio banco.
**Consequência:** mudar argumentos de fila exige recriar o container do RabbitMQ (não há volume; as definições são recarregadas no boot).

## Conexões separadas para publicação e consumo
**Contexto:** publisher e subscriber compartilhavam conexão e canal. Quando o broker dispara alarme de memória ou disco, ele bloqueia as conexões que publicam — e os acks do consumidor, na mesma conexão, ficariam presos junto.
**Decisão:** duas instâncias de `RabbitMqConnection` (`PUBLISHER_CONNECTION` e `CONSUMER_CONNECTION`), cada uma com sua conexão e confirm channel, ambas crash-only. Seguem a recomendação da documentação do RabbitMQ. A de publicação abre no boot para o `/ready` (que exige as duas abertas) refletir o broker.

# Contrato de eventos

Exchange `payments` (topic), com alternate exchange `payments.unroutable` (fanout): mensagem publicada sem fila de destino vai para a fila `payments.unroutable` em vez de ser descartada. Mensagens JSON, `content_type: application/json`, `delivery_mode: 2` (persistente), `message_id = event_id`.

## Envelope

| campo | tipo | descrição |
|---|---|---|
| event_id | uuid | identificador único; usado para deduplicação |
| type | string | igual à routing key |
| occurred_at | string ISO-8601 UTC | quando o evento ocorreu |
| data | objeto | conteúdo por tipo (abaixo) |

## Tipos

| type / routing key | produtor | consumidor | data |
|---|---|---|---|
| `charge.created` | api (outbox) | worker | `charge_id` uuid, `amount_cents` int, `currency` "BRL" |
| `charge.succeeded` | worker | api | `charge_id` uuid |
| `charge.failed` | worker | api | `charge_id` uuid, `reason` string não vazia (gateway simulado: `"card_declined"` quando os dois últimos dígitos de `amount_cents` são `13`) |

## Filas

| fila | origem | observação |
|---|---|---|
| `worker.charge-created` | binding `charge.created` | nack sem requeue → `worker.charge-created.dlq` |
| `worker.charge-created.retry` | worker publica via default exchange | TTL 5s, depois volta para `charge.created` |
| `worker.charge-created.dlq` | worker (3ª falha) ou dead letter | inspeção manual |
| `api.charge-results` | bindings `charge.succeeded`, `charge.failed` | quorum queue; nack sem requeue → `api.charge-results.dlq`; nack com requeue (erro transitório) volta para a fila até `x-delivery-limit` 5 (6 entregas no total), depois vai para a DLQ |
| `api.charge-results.dlq` | dead letter | inspeção manual |
| `payments.unroutable` | alternate exchange `payments.unroutable` | eventos sem binding para a routing key (ex.: tipo novo ou erro de digitação); inspeção manual |

## Retry no worker

Cabeçalho `x-attempt` (inteiro; ausente = 1). Erro transitório com `x-attempt < 3` → republica em `worker.charge-created.retry` com `x-attempt + 1`; caso contrário → `worker.charge-created.dlq`.

## Exemplo

```json
{
  "event_id": "0b7c6f1e-4a43-4c4e-9a0e-0c1b7d2f5a11",
  "type": "charge.created",
  "occurred_at": "2026-10-14T12:00:00.000Z",
  "data": { "charge_id": "5f0e2b8a-9d3c-4f6e-8a1b-2c3d4e5f6a7b", "amount_cents": 1500, "currency": "BRL" }
}
```

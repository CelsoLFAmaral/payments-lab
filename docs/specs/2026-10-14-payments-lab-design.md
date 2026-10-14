# payments-lab — Design

Data: 2026-10-14
Status: aprovado

## Objetivo

Projeto de estudo e portfólio público, pensado para uma vaga sênior em time de sistemas financeiros. Demonstra, em código rodando, os temas que a vaga pede e que não aparecem no histórico profissional: NestJS, Go, mensageria (RabbitMQ), microsserviços, Redis, Docker, Kubernetes e CI/CD — sobre um domínio financeiro (cobranças) com idempotência e consistência eventual.

## Divisão de autoria

- **API (NestJS), infraestrutura, CI e documentação:** implementados com assistência de IA.
- **Worker (Go):** escrito pelo Celso do zero, seguindo o roteiro em `worker/README.md`. A IA não escreve código do worker; pode revisar e explicar.
- Commits apenas com autoria do Celso, sem `Co-Authored-By`.

## Arquitetura

Cada serviço é dono do próprio dado; a comunicação entre eles é só por eventos.

```
Cliente → API (NestJS) → Postgres [charges + outbox]
                 │ outbox relay
                 ▼
          RabbitMQ: charge.created
                 ▼
          Worker (Go) → gateway simulado
                 │ dedupe no Redis, retry com atraso, DLQ
                 ▼
          RabbitMQ: charge.succeeded / charge.failed
                 ▼
          API consome → atualiza status no Postgres
```

Alternativas descartadas:
- Worker gravando direto no Postgres da API: banco compartilhado acopla os serviços.
- Worker chamando a API por HTTP: acopla e elimina a mensageria na volta.

## Estrutura do repositório

```
payments-lab/
├── api/                        NestJS + TypeScript strict + TypeORM + Jest
├── worker/                     Go (esqueleto mínimo + README com contrato e roteiro)
├── infra/
│   ├── docker-compose.yml      postgres, rabbitmq, redis, api, worker
│   └── rabbitmq/definitions.json   topologia completa (exchanges, filas, DLQ)
├── k8s/                        etapa 2
├── scripts/smoke.sh            teste ponta a ponta do fluxo
├── docs/events.md              contrato dos eventos
├── .github/workflows/ci.yml
├── .husky/pre-push
├── CLAUDE.md
└── .claude/decisions.md
```

Decisões:
- Topologia do RabbitMQ declarada em `definitions.json`, carregado pelo container. Os serviços não declaram filas.
- TypeORM em vez de Prisma: padrão da documentação do NestJS e suporta `SELECT ... FOR UPDATE SKIP LOCKED` pelo query builder.
- Redis apenas no worker, para deduplicação. Sem lock distribuído (nenhum fluxo precisa).

## API

### `POST /charges`

- Cabeçalho `Idempotency-Key` obrigatório (ausente → 400).
- Corpo: `{ "amount_cents": int, "currency": "BRL", "customer_id": string, "description": string }`.
- `amount_cents` inteiro > 0; `currency` aceita apenas `BRL`.
- Resposta 201 com a cobrança criada (`status: "pending"`).
- Mesma key + mesmo corpo → 200 com a cobrança original.
- Mesma key + corpo diferente → 409.
- "Mesmo corpo" = mesmo `request_hash` (SHA-256 do JSON canônico do corpo validado).
- Requisições concorrentes com a mesma key: a constraint `UNIQUE(idempotency_key)` decide; a perdedora relê e aplica a regra acima.

### `GET /charges/:id`

Retorna a cobrança (404 se não existir).

### `GET /health` e `GET /ready`

`/health` responde 200 se o processo está de pé; `/ready` checa Postgres e RabbitMQ. Usados pelo compose e, na etapa 2, pelas probes do Kubernetes.

## Modelo de dados (Postgres)

`charges`
| coluna | tipo |
|---|---|
| id | uuid PK |
| amount_cents | bigint, CHECK > 0 |
| currency | char(3) |
| customer_id | text |
| description | text |
| status | text: `pending`, `succeeded`, `failed` |
| failure_reason | text NULL |
| idempotency_key | text UNIQUE |
| request_hash | char(64) |
| created_at, updated_at | timestamptz |

`outbox`
| coluna | tipo |
|---|---|
| id | bigserial PK |
| event_id | uuid UNIQUE |
| event_type | text |
| payload | jsonb (envelope completo) |
| created_at | timestamptz |
| published_at | timestamptz NULL |

`processed_events`
| coluna | tipo |
|---|---|
| event_id | uuid PK |
| processed_at | timestamptz |

Schema via migrations do TypeORM (sem `synchronize`).

### Outbox relay

- Cobrança e linha do outbox gravadas na mesma transação.
- A cada 1s: em transação, `SELECT ... WHERE published_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`, publica cada evento com publisher confirms e marca `published_at`.
- Garantia: at-least-once. Duplicatas são tratadas pelos consumidores.

## Eventos

Envelope (documentado em `docs/events.md`):

```json
{
  "event_id": "uuid",
  "type": "charge.created",
  "occurred_at": "2026-10-14T12:00:00Z",
  "data": { "charge_id": "uuid", "amount_cents": 1500, "currency": "BRL" }
}
```

- `charge.created`: `data` = `charge_id`, `amount_cents`, `currency`.
- `charge.succeeded`: `data` = `charge_id`.
- `charge.failed`: `data` = `charge_id`, `reason`.

Mensagens publicadas como JSON, `content_type: application/json`, `delivery_mode: persistent`, `message_id = event_id`.

## Topologia RabbitMQ

- Exchange `payments` (topic, durable).
- Fila `worker.charge-created` ← binding `charge.created`; `x-dead-letter-exchange: ""`, `x-dead-letter-routing-key: worker.charge-created.dlq` (nack sem requeue cai na DLQ).
- Fila `worker.charge-created.retry`: `x-message-ttl: 5000`, `x-dead-letter-exchange: payments`, `x-dead-letter-routing-key: charge.created`. Sem consumidor: ao expirar, volta para a fila principal.
- Fila `worker.charge-created.dlq`: destino final após 3 tentativas.
- Fila `api.charge-results` ← bindings `charge.succeeded` e `charge.failed`; dead letter para `api.charge-results.dlq`.
- Fila `api.charge-results.dlq`.
- O worker publica na retry e na DLQ pelo default exchange (routing key = nome da fila).

## Contrato do worker (Go)

1. Consumir `worker.charge-created` com prefetch limitado e ack manual.
2. Deduplicar por `event_id` no Redis: `SET processed:<event_id> 1 NX EX 86400`. Já existente → ack e ignora.
3. Chamar o gateway simulado (determinístico pelos dois últimos dígitos de `amount_cents`):
   - `13` → recusado: publica `charge.failed` com `reason: "card_declined"`.
   - `99` → erro transitório: retry.
   - demais → publica `charge.succeeded`.
4. Retry: lê `x-attempt` (ausente = 1). Se `< 3`, republica na fila de retry com `x-attempt + 1`; senão, publica na DLQ. Em ambos, ack na original.
5. Ack só depois de publicar o resultado (com publisher confirms).
6. Erro transitório no retry deve remover a chave de dedupe do Redis antes de republicar, para que a nova tentativa seja processada.
7. Mensagem mal formada → nack sem requeue (cai na DLQ pelo dead letter da fila principal).

Configuração por env: `RABBITMQ_URL`, `REDIS_URL`.

## Tratamento de erros na API

- Consumer de `api.charge-results`: em uma transação, insere `event_id` em `processed_events`; conflito = já processado → ack.
- Transição de status só a partir de `pending`; cobrança já finalizada → ack + log de aviso.
- Mensagem mal formada ou cobrança inexistente → nack sem requeue (vai para `api.charge-results.dlq`) + log de erro.
- Erros de validação HTTP com mensagem contendo valor recebido e esperado.

## Testes

API (Jest):
- Unitários: cálculo de `request_hash`, regra de idempotência (mesmo/diferente corpo), transições de status, validação de `amount_cents`.
- Integração (Postgres do compose): requisições concorrentes com a mesma key geram uma cobrança; cobrança e outbox gravadas juntas; relay não publica a mesma linha duas vezes (publisher mockado).
- Consumer testado chamando o handler diretamente, sem RabbitMQ.

Worker (Celso, TDD): lista de testes esperados no `worker/README.md` — gateway simulado, decisão retry/DLQ a partir de `x-attempt`, dedupe com Redis atrás de interface.

## CI e hooks

- GitHub Actions em push/PR: job `api` (lint, build, testes com service Postgres) e job `worker` (`go vet`, `go test`).
- `.husky/pre-push`: testes da API; testes do worker se `go` estiver no PATH.
- Sem deploy.

## Etapas

**Etapa 1**
- IA: estrutura, compose, topologia, API completa com testes, CI, `worker/` mínimo (go.mod, main.go, um teste, Dockerfile) e `worker/README.md` com contrato e roteiro.
- Celso: worker conforme contrato.
- Pronto quando: `docker compose up` sobe tudo e `scripts/smoke.sh` cria cobranças de 1500, 1513 e 1599 centavos e verifica `succeeded`, `failed` e a mensagem na DLQ (cobrança 1599 permanece `pending`).

**Etapa 2 (opcional)**
- `k8s/`: Deployment, Service, ConfigMap/Secret e probes para api e worker; Postgres, RabbitMQ e Redis com manifests simples; roda em cluster kind.

## Fora de escopo

Autenticação, múltiplas moedas, reembolso, frontend, gateway real, observabilidade além de logs estruturados.

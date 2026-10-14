# payments-lab

Serviço de cobranças orientado a eventos, feito para estudar sistemas financeiros distribuídos.

- **API** (NestJS + TypeScript + PostgreSQL): cria cobranças com idempotência e publica eventos via transactional outbox.
- **Worker** (Go): processa pagamentos num gateway simulado, com deduplicação no Redis, retry com atraso e dead letter queue.
- **RabbitMQ** conecta os dois; a topologia está em `infra/rabbitmq/definitions.json`.

```
Cliente → API → Postgres [charges + outbox] → RabbitMQ → Worker (Go) → RabbitMQ → API
```

Conceitos demonstrados: idempotency key, dinheiro em centavos, transactional outbox, at-least-once com consumidores idempotentes, `SELECT ... FOR UPDATE SKIP LOCKED`, retry via TTL + dead letter, DLQ, publisher confirms.

## Status

Etapa 1: a API está pronta (cobranças, idempotência, outbox, consumo de resultados). O worker em Go está em desenvolvimento — hoje é um esqueleto que sai com código 0. Por isso `scripts/smoke.sh` (fluxo completo com o worker) ainda falha; use `scripts/smoke-api.sh`, que simula o worker publicando o resultado pela management API.

## Rodando

```bash
docker compose -f infra/docker-compose.yml up -d --build --wait
./scripts/smoke-api.sh
```

Portas publicadas só em `127.0.0.1`: API 3000, Postgres 5432, RabbitMQ 5672 e management 15672, Redis 6379. As credenciais (`payments`/`payments`) são apenas para desenvolvimento local.

## Testes

```bash
npm install                      # na raiz: ativa o hook de pre-push (husky), que roda os unitários
npm --prefix api test            # unitários
npm --prefix api run test:e2e    # integração; usa o banco payments_test do Postgres do compose
```

O CI (GitHub Actions) roda lint, build, unitários e e2e da API e os testes do worker.

Mudanças em `infra/rabbitmq/definitions.json` exigem recriar o RabbitMQ (sem volume; definições carregadas no boot): `docker compose -f infra/docker-compose.yml up -d --force-recreate rabbitmq`. Mudanças em `infra/postgres/init.sql` só valem com volume novo: `docker compose -f infra/docker-compose.yml down -v`.

Detalhes: `docs/specs/`, `docs/events.md`, `.claude/decisions.md`.

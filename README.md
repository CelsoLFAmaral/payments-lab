# payments-lab

Serviço de cobranças orientado a eventos, feito para estudar sistemas financeiros distribuídos.

- **API** (NestJS + TypeScript + PostgreSQL): cria cobranças com idempotência e publica eventos via transactional outbox.
- **Worker** (Go): processa pagamentos num gateway simulado, com deduplicação no Redis, retry com atraso e dead letter queue.
- **RabbitMQ** conecta os dois; a topologia está em `infra/rabbitmq/definitions.json`.

```
Cliente → API → Postgres [charges + outbox] → RabbitMQ → Worker (Go) → RabbitMQ → API
```

Conceitos demonstrados: idempotency key, dinheiro em centavos, transactional outbox, at-least-once com consumidores idempotentes, `SELECT ... FOR UPDATE SKIP LOCKED`, retry via TTL + dead letter, DLQ, publisher confirms.

## Rodando

```bash
docker compose -f infra/docker-compose.yml up -d --build --wait
./scripts/smoke.sh
```

Mudanças em `infra/rabbitmq/definitions.json` exigem recriar o RabbitMQ (sem volume; definições carregadas no boot): `docker compose -f infra/docker-compose.yml up -d --force-recreate rabbitmq`. Mudanças em `infra/postgres/init.sql` só valem com volume novo: `docker compose -f infra/docker-compose.yml down -v`.

Detalhes: `docs/specs/`, `docs/events.md`, `.claude/decisions.md`.

# payments-lab

Projeto de estudo/portfólio: serviço de cobranças com NestJS, worker em Go, RabbitMQ, Redis e Postgres. Spec: `docs/specs/2026-10-14-payments-lab-design.md`. Decisões: `.claude/decisions.md`. Contrato de eventos: `docs/events.md`.

## Regras de autoria

- **Não escreva código em `worker/`.** O worker é escrito pelo Celso para aprender Go. Pode explicar, revisar e sugerir quando ele pedir, mas sem aplicar edições.
- Commits com autoria do Celso (sem trailers de coautoria).

## Como rodar

```bash
docker compose -f infra/docker-compose.yml up -d --build --wait   # postgres, rabbitmq, redis, api (o worker esqueleto sai com 0)
./scripts/smoke-api.sh                                             # API ponta a ponta, simulando o worker
./scripts/smoke.sh                                                 # fluxo completo; só passa com o worker implementado
```

API fora do container (hot reload): não há carregamento de `api/.env`; exporte as variáveis no shell. O container `api` ocupa a porta 3000, então pare-o antes:

```bash
docker compose -f infra/docker-compose.yml stop api
export DATABASE_URL=postgres://payments:payments@localhost:5432/payments
export RABBITMQ_URL=amqp://payments:payments@localhost:5672
npm --prefix api run start:dev
```

RabbitMQ management: http://localhost:15672 (payments/payments).

Mudou `infra/rabbitmq/definitions.json` (ex.: argumentos de fila)? Recrie o RabbitMQ — o container não tem volume e recarrega as definições no boot: `docker compose -f infra/docker-compose.yml up -d --force-recreate rabbitmq`. Mudou `infra/postgres/init.sql`? Ele só roda em volume novo: `docker compose -f infra/docker-compose.yml down -v` e suba de novo.

## Arquitetura

- `api/src/charges`: HTTP de cobranças, idempotência por `Idempotency-Key`, handler de resultados.
- `api/src/outbox`: entidades do outbox e `OutboxRelay` (publica a cada `OUTBOX_INTERVAL_MS`).
- `api/src/messaging`: duas conexões RabbitMQ (publicação e consumo), publisher com confirms, subscriber de `api.charge-results`.
- `api/src/health`: `/health` e `/ready`.
- `infra/rabbitmq/definitions.json`: toda a topologia de mensageria.

## Invariantes

- Cobrança e linha do outbox são gravadas na mesma transação.
- `amount_cents` é inteiro entre 1 e `Number.MAX_SAFE_INTEGER` (DTO e constraint no banco); nunca usar float para dinheiro.
- Status só sai de `pending`; estados finais não mudam.
- Todo consumidor é idempotente por `event_id`.
- Serviços não declaram filas; mudanças de topologia vão em `definitions.json`.

## Testes

```bash
npm install                      # na raiz: ativa o hook de pre-push (husky)
npm --prefix api test            # unitários
npm --prefix api run test:e2e    # integração; usa o banco payments_test do postgres do compose
(cd worker && go test ./...)     # worker
```

Os e2e recusam rodar se `DATABASE_URL` não apontar para um banco com sufixo `_test` (a suíte apaga o schema).

O `pre-push` roda os unitários da API e os testes do worker (se `go` estiver instalado). O CI roda tudo, incluindo e2e.

## Estilo de código

- Funções curtas (até ~20 linhas) e arquivos até ~300 linhas — uma unidade deve caber numa leitura só.
- Nomes específicos e grepáveis — evitar `data`, `handler`, `Manager` genéricos.
- Dependency injection em vez de dependência hardcoded, para facilitar mock em teste.
- Guard clauses / early return — no máximo 2 níveis de indentação.
- Mensagens de erro com contexto: valor recebido vs. esperado, não só "invalid input".
- Comentários em português e só para o "por quê" não óbvio; identificadores em inglês.

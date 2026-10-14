# payments-lab

Projeto de estudo/portfólio: serviço de cobranças com NestJS, worker em Go, RabbitMQ, Redis e Postgres. Spec: `docs/specs/2026-10-14-payments-lab-design.md`. Decisões: `.claude/decisions.md`. Contrato de eventos: `docs/events.md`.

## Regras de autoria

- **Não escreva código em `worker/`.** O worker é escrito pelo Celso para aprender Go. Pode explicar, revisar e sugerir quando ele pedir, mas sem aplicar edições.
- Commits só com autoria do Celso: **nunca** adicionar `Co-Authored-By` ou qualquer menção ao Claude em commits e PRs.

## Como rodar

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # postgres, rabbitmq, redis (+ api, worker)
npm --prefix api run start:dev                              # API local em :3000 (precisa de api/.env ou envs exportadas)
./scripts/smoke.sh                                          # fluxo ponta a ponta (precisa do worker pronto)
```

RabbitMQ management: http://localhost:15672 (payments/payments).

## Arquitetura

- `api/src/charges`: HTTP de cobranças, idempotência por `Idempotency-Key`, handler de resultados.
- `api/src/outbox`: entidades do outbox e `OutboxRelay` (publica a cada `OUTBOX_INTERVAL_MS`).
- `api/src/messaging`: conexão RabbitMQ, publisher com confirms, subscriber de `api.charge-results`.
- `api/src/health`: `/health` e `/ready`.
- `infra/rabbitmq/definitions.json`: toda a topologia de mensageria.

## Invariantes

- Cobrança e linha do outbox são gravadas na mesma transação.
- `amount_cents` é inteiro > 0; nunca usar float para dinheiro.
- Status só sai de `pending`; estados finais não mudam.
- Todo consumidor é idempotente por `event_id`.
- Serviços não declaram filas; mudanças de topologia vão em `definitions.json`.

## Testes

```bash
npm --prefix api test            # unitários
npm --prefix api run test:e2e    # integração; precisa do postgres do compose
(cd worker && go test ./...)     # worker
```

O `pre-push` roda os unitários da API e os testes do worker (se `go` estiver instalado). O CI roda tudo, incluindo e2e.

## Estilo de código

- Funções curtas (até ~20 linhas) e arquivos até ~300 linhas — uma unidade deve caber numa leitura só.
- Nomes específicos e grepáveis — evitar `data`, `handler`, `Manager` genéricos.
- Dependency injection em vez de dependência hardcoded, para facilitar mock em teste.
- Guard clauses / early return — no máximo 2 níveis de indentação.
- Mensagens de erro com contexto: valor recebido vs. esperado, não só "invalid input".
- Comentários em português e só para o "por quê" não óbvio; identificadores em inglês.

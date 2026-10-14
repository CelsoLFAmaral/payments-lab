# Worker (Go)

Processa `charge.created`, chama um gateway simulado e publica `charge.succeeded` ou `charge.failed`.
Contrato completo: `../docs/events.md` e seção "Contrato do worker" da spec.

> Este diretório é escrito à mão pelo Celso. A IA pode explicar e revisar, não escrever.

## Rodando

```bash
go test ./...                     # precisa de Go 1.25+ instalado
docker compose -f ../infra/docker-compose.yml up -d --build worker
../scripts/smoke.sh               # critério de pronto da etapa 1
```

Instalar Go: https://go.dev/doc/install (tarball oficial) ou `sudo apt install golang-go` se a versão do apt for ≥ 1.25.

Bibliotecas sugeridas: `github.com/rabbitmq/amqp091-go`, `github.com/redis/go-redis/v9`.

## Roteiro

Cada passo termina com testes passando e um commit. Faça em TDD: teste primeiro.

### 1. Gateway simulado (função pura)
`func Charge(amountCents int64) Outcome` onde `Outcome` é `Approved`, `Declined` ou `TransientError`.
- dois últimos dígitos `13` → `Declined` (publica `charge.failed` com `reason: "card_declined"`)
- `99` → `TransientError`
- demais → `Approved`

**Testes:** table-driven (`[]struct{ name string; amount int64; want Outcome }`) cobrindo 1500, 1513, 1599, 13, 99, 100013.
**Estudar:** tipos com `iota`, table-driven tests, `t.Run`.

### 2. Decisão de retry (função pura)
`func NextStep(attempt int) Step` → `Retry` se `attempt < 3`, senão `DeadLetter`. E `func AttemptFromHeaders(h amqp.Table) int` (ausente ou inválido = 1).

**Testes:** attempt 1 e 2 → Retry; 3 e 4 → DeadLetter; cabeçalho ausente, `int32`, `int64` e string.
**Estudar:** como o amqp091 representa números em headers (`int32`/`int64`), type switch.

### 3. Deduplicação atrás de interface
```go
type Deduper interface {
    MarkIfNew(ctx context.Context, eventID string) (bool, error) // SET processed:<id> 1 NX EX 86400
    Forget(ctx context.Context, eventID string) error           // DEL, usado antes do retry
}
```
Implementação `RedisDeduper` + `fakeDeduper` (map) para testes.
**Estudar:** interfaces implícitas em Go, `context.Context`, `SET NX EX`.

### 4. Parsing do evento
`type ChargeCreated struct { EventID string; ChargeID string; AmountCents int64; Currency string }` com `encoding/json` e validação (UUIDs não vazios, amount > 0).
**Testes:** JSON válido, campo faltando, amount como string.
**Estudar:** struct tags `json:"..."`, erros com `fmt.Errorf("...: %w", err)`.

### 5. Processamento (núcleo testável)
`func (p *Processor) Handle(ctx, msg Message) (Action, error)` — recebe corpo + headers, devolve o que fazer: `PublishResult{type, data}`, `Retry{attempt}`, `DeadLetter`, `Skip` (duplicado). Depende de `Deduper` e do gateway por interface.
**Testes:** os 5 caminhos, incluindo "retry chama `Forget` antes de republicar".
**Estudar:** injeção de dependência sem framework, por que separar decisão de efeito colateral.

### 6. Publicação com confirms
`Publisher` sobre `amqp091`: `channel.Confirm(false)`, `PublishWithDeferredConfirmWithContext`, esperar `Wait()`.
- resultado → exchange `payments`, routing key `charge.succeeded`/`charge.failed`, `ContentType: application/json`, `DeliveryMode: amqp.Persistent`, `MessageId: <novo uuid>`
- retry → exchange `""`, routing key `worker.charge-created.retry`, header `x-attempt`
- DLQ → exchange `""`, routing key `worker.charge-created.dlq`

### 7. Loop de consumo
`channel.Qos(10, 0, false)`, `Consume("worker.charge-created", ..., autoAck=false)`. Para cada mensagem: `Processor.Handle` → executa a ação → `Ack` **só depois** de publicar. JSON inválido → `Nack(false, false)`.
**Estudar:** goroutines e channels (`for msg := range deliveries`).

### 8. Configuração e shutdown
Ler `RABBITMQ_URL` e `REDIS_URL` (falhar com mensagem clara se ausentes). `signal.NotifyContext(ctx, syscall.SIGTERM, os.Interrupt)` para parar de consumir e fechar conexões.
Trocar `restart: on-failure` por `restart: unless-stopped` no compose quando o worker for de longa duração.

### 9. Pronto
`../scripts/smoke.sh` passa.

## Perguntas para treinar (entrevista)

- Por que dar ack só depois de publicar o resultado? O que acontece se o processo cair entre os dois?
- Por que o worker precisa deduplicar se o RabbitMQ entrega cada mensagem uma vez?
- O que acontece com a deduplicação se o Redis cair? Quais as opções (falhar fechado vs. aberto)?
- Por que apagar a chave do Redis antes do retry?
- Como escalar para 3 réplicas do worker? O que muda?
- Por que retry via fila com TTL e não `time.Sleep`?

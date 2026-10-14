#!/usr/bin/env bash
# Smoke da API sem o worker: cria uma cobrança, confere que o charge.created chegou
# na fila do worker e simula o resultado publicando charge.succeeded na exchange.
set -euo pipefail

API=${API:-http://localhost:3000}
MGMT=${MGMT:-http://localhost:15672}
AUTH=payments:payments
TIMEOUT=${TIMEOUT:-30}
QUEUE=worker.charge-created
UNROUTABLE_QUEUE=payments.unroutable

fail() {
  echo "FALHOU: $*" >&2
  exit 1
}

new_uuid() {
  uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid
}

queue_info() {
  local queue=${1:-$QUEUE}
  curl -sS --fail-with-body -u "$AUTH" "$MGMT/api/queues/%2F/$queue" ||
    fail "management API não respondeu em $MGMT (fila $queue)"
}

create_charge() {
  curl -sS --fail-with-body -X POST "$API/charges" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: smoke-api-$(new_uuid)" \
    -d '{"amount_cents":1500,"currency":"BRL","customer_id":"smoke","description":"smoke api"}' ||
    fail "POST $API/charges não devolveu 2xx"
}

status_of() {
  curl -sS --fail-with-body "$API/charges/$1" | jq -r .status ||
    fail "GET $API/charges/$1 não devolveu 2xx"
}

# Envelope no formato de docs/events.md, publicado como o worker faria
publish_succeeded() {
  local charge_id=$1 event_id
  event_id=$(new_uuid)
  local envelope
  envelope=$(jq -nc --arg e "$event_id" --arg c "$charge_id" --arg t "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
    '{event_id: $e, type: "charge.succeeded", occurred_at: $t, data: {charge_id: $c}}')
  jq -nc --arg p "$envelope" --arg e "$event_id" \
    '{routing_key: "charge.succeeded", payload: $p, payload_encoding: "string",
      properties: {content_type: "application/json", delivery_mode: 2, message_id: $e}}' |
    curl -sS --fail-with-body -u "$AUTH" -H 'Content-Type: application/json' \
      -X POST "$MGMT/api/exchanges/%2F/payments/publish" -d @- ||
    fail "publicação de charge.succeeded via management API falhou"
}

curl -sS --fail-with-body "$API/ready" >/dev/null || fail "API não está pronta em $API/ready"

info=$(queue_info)
consumers=$(jq '.consumers // 0' <<<"$info")
(( consumers == 0 )) || fail "$QUEUE tem $consumers consumidor(es); com o worker rodando use scripts/smoke.sh"
before=$(jq '.messages // 0' <<<"$info")
unroutable_before=$(queue_info "$UNROUTABLE_QUEUE" | jq '.messages // 0')

charge=$(create_charge)
charge_id=$(jq -r .id <<<"$charge")
[[ "$(jq -r .status <<<"$charge")" == pending ]] || fail "cobrança criada deveria estar pending: $charge"
echo "cobrança $charge_id criada (pending); $QUEUE tinha $before mensagem(ns)"

after=$before
for _ in $(seq "$TIMEOUT"); do
  after=$(queue_info | jq '.messages // 0')
  (( after > before )) && break
  sleep 1
done
(( after > before )) || fail "$QUEUE não recebeu charge.created em ${TIMEOUT}s (antes: $before, depois: $after)"
echo "charge.created na fila ($before -> $after)"

publish_succeeded "$charge_id" >/dev/null

status=pending
for _ in $(seq "$TIMEOUT"); do
  status=$(status_of "$charge_id")
  [[ "$status" == succeeded ]] && break
  sleep 1
done
[[ "$status" == succeeded ]] || fail "cobrança $charge_id esperava succeeded em ${TIMEOUT}s, está $status"

unroutable_after=$(queue_info "$UNROUTABLE_QUEUE" | jq '.messages // 0')
(( unroutable_after <= unroutable_before )) ||
  fail "$UNROUTABLE_QUEUE recebeu mensagem(ns) sem rota (antes: $unroutable_before, depois: $unroutable_after)"

echo "OK: cobrança criada, charge.created publicado e charge.succeeded aplicado"

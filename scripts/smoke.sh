#!/usr/bin/env bash
# Fluxo ponta a ponta: precisa do compose de pé e do worker implementado.
set -euo pipefail

API=${API:-http://localhost:3000}
MGMT=${MGMT:-http://localhost:15672}
AUTH=payments:payments
TIMEOUT=${TIMEOUT:-40}

create_charge() {
  curl -sf -X POST "$API/charges" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: smoke-$1-$(date +%s%N)" \
    -d "{\"amount_cents\":$1,\"currency\":\"BRL\",\"customer_id\":\"smoke\",\"description\":\"smoke $1\"}" | jq -r .id
}

status_of() {
  curl -sf "$API/charges/$1" | jq -r .status
}

wait_status() {
  local id=$1 expected=$2
  for _ in $(seq "$TIMEOUT"); do
    [[ "$(status_of "$id")" == "$expected" ]] && return 0
    sleep 1
  done
  echo "FALHOU: cobrança $id esperava $expected, está $(status_of "$id")" >&2
  return 1
}

dlq_count() {
  curl -sf -u "$AUTH" "$MGMT/api/queues/%2F/worker.charge-created.dlq" | jq .messages
}

curl -sf "$API/ready" >/dev/null || { echo "API não está pronta em $API" >&2; exit 1; }
dlq_before=$(dlq_count)

ok_id=$(create_charge 1500)
declined_id=$(create_charge 1513)
transient_id=$(create_charge 1599)

wait_status "$ok_id" succeeded
wait_status "$declined_id" failed

for _ in $(seq "$TIMEOUT"); do
  (( $(dlq_count) > dlq_before )) && break
  sleep 1
done
(( $(dlq_count) > dlq_before )) || { echo "FALHOU: nenhuma mensagem nova na DLQ" >&2; exit 1; }
[[ "$(status_of "$transient_id")" == "pending" ]] || { echo "FALHOU: 1599 deveria continuar pending" >&2; exit 1; }

echo "OK: succeeded, failed e DLQ funcionando"

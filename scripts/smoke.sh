#!/usr/bin/env bash
# Fluxo ponta a ponta: precisa do compose de pé e do worker implementado.
# Sem o worker, use scripts/smoke-api.sh.
set -euo pipefail

API=${API:-http://localhost:3000}
MGMT=${MGMT:-http://localhost:15672}
AUTH=payments:payments
TIMEOUT=${TIMEOUT:-40}
DLQ=worker.charge-created.dlq

fail() {
  echo "FALHOU: $*" >&2
  exit 1
}

create_charge() {
  curl -sS --fail-with-body -X POST "$API/charges" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: smoke-$1-$(date +%s%N)" \
    -d "{\"amount_cents\":$1,\"currency\":\"BRL\",\"customer_id\":\"smoke\",\"description\":\"smoke $1\"}" |
    jq -r .id || fail "POST $API/charges (amount_cents=$1) não devolveu 2xx"
}

status_of() {
  curl -sS --fail-with-body "$API/charges/$1" | jq -r .status ||
    fail "GET $API/charges/$1 não devolveu 2xx"
}

wait_status() {
  local id=$1 expected=$2 status=
  for _ in $(seq "$TIMEOUT"); do
    status=$(status_of "$id")
    [[ "$status" == "$expected" ]] && return 0
    sleep 1
  done
  fail "cobrança $id esperava $expected em ${TIMEOUT}s, está $status"
}

dlq_count() {
  curl -sS --fail-with-body -u "$AUTH" "$MGMT/api/queues/%2F/$DLQ" | jq '.messages // 0' ||
    fail "management API não respondeu em $MGMT (fila $DLQ)"
}

curl -sS --fail-with-body "$API/ready" >/dev/null || fail "API não está pronta em $API/ready"
dlq_before=$(dlq_count)

ok_id=$(create_charge 1500)
declined_id=$(create_charge 1513)
transient_id=$(create_charge 1599)

wait_status "$ok_id" succeeded
wait_status "$declined_id" failed

dlq_after=$dlq_before
for _ in $(seq "$TIMEOUT"); do
  dlq_after=$(dlq_count)
  (( dlq_after > dlq_before )) && break
  sleep 1
done
(( dlq_after > dlq_before )) || fail "nenhuma mensagem nova em $DLQ em ${TIMEOUT}s (antes: $dlq_before, depois: $dlq_after)"
transient_status=$(status_of "$transient_id")
[[ "$transient_status" == pending ]] || fail "cobrança $transient_id (1599) deveria continuar pending, está $transient_status"

echo "OK: succeeded, failed e DLQ funcionando"

export type ChargeResult =
  | { eventId: string; chargeId: string; outcome: 'succeeded' }
  | { eventId: string; chargeId: string; outcome: 'failed'; reason: string };

export class MalformedEventError extends Error {}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value === 'string' && UUID_PATTERN.test(value)) return value;
  throw new MalformedEventError(
    `${field} deve ser UUID; recebido: ${JSON.stringify(value)}`,
  );
}

export function parseChargeResult(raw: unknown): ChargeResult {
  if (!isRecord(raw))
    throw new MalformedEventError(
      `evento deve ser objeto JSON; recebido: ${typeof raw}`,
    );
  const eventId = requireUuid(raw.event_id, 'event_id');
  if (raw.type !== 'charge.succeeded' && raw.type !== 'charge.failed') {
    throw new MalformedEventError(
      `type deve ser charge.succeeded ou charge.failed; recebido: ${JSON.stringify(raw.type)}`,
    );
  }
  const data = isRecord(raw.data) ? raw.data : {};
  const chargeId = requireUuid(data.charge_id, 'data.charge_id');
  if (raw.type === 'charge.succeeded')
    return { eventId, chargeId, outcome: 'succeeded' };
  if (typeof data.reason !== 'string' || data.reason === '') {
    throw new MalformedEventError(
      `data.reason deve ser string não vazia; recebido: ${JSON.stringify(data.reason)}`,
    );
  }
  return { eventId, chargeId, outcome: 'failed', reason: data.reason };
}

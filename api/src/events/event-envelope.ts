import { randomUUID } from 'node:crypto';

export type ChargeEventType =
  'charge.created' | 'charge.succeeded' | 'charge.failed';

export interface EventEnvelope<T> {
  event_id: string;
  type: ChargeEventType;
  occurred_at: string;
  data: T;
}

export interface ChargeCreatedData {
  charge_id: string;
  amount_cents: number;
  currency: string;
}

export function buildEnvelope<T>(
  type: ChargeEventType,
  data: T,
  now = new Date(),
): EventEnvelope<T> {
  return { event_id: randomUUID(), type, occurred_at: now.toISOString(), data };
}

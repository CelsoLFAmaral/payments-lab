import { createHash } from 'node:crypto';

export interface ChargeRequest {
  amount_cents: number;
  currency: string;
  customer_id: string;
  description: string;
}

// Monta o objeto com ordem fixa de chaves para o hash não depender da ordem do JSON recebido
export function computeRequestHash(request: ChargeRequest): string {
  const canonical = JSON.stringify({
    amount_cents: request.amount_cents,
    currency: request.currency,
    customer_id: request.customer_id,
    description: request.description,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

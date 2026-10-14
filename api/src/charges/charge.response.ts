import { Charge } from './charge.entity';
import { ChargeStatus } from './charge-status';

export interface ChargeResponse {
  id: string;
  amount_cents: number;
  currency: string;
  customer_id: string;
  description: string;
  status: ChargeStatus;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function toChargeResponse(charge: Charge): ChargeResponse {
  return {
    id: charge.id,
    amount_cents: charge.amountCents,
    currency: charge.currency,
    customer_id: charge.customerId,
    description: charge.description,
    status: charge.status,
    failure_reason: charge.failureReason,
    created_at: charge.createdAt.toISOString(),
    updated_at: charge.updatedAt.toISOString(),
  };
}

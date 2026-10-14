export type ChargeStatus = 'pending' | 'succeeded' | 'failed';

export function canTransition(from: ChargeStatus, to: ChargeStatus): boolean {
  return from === 'pending' && to !== 'pending';
}

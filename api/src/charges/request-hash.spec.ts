import { computeRequestHash } from './request-hash';

const base = {
  amount_cents: 1500,
  currency: 'BRL',
  customer_id: 'cus_1',
  description: 'Plano',
};

describe('computeRequestHash', () => {
  it('gera sha256 em hex', () => {
    expect(computeRequestHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('não depende da ordem das chaves', () => {
    const reordered = {
      description: 'Plano',
      customer_id: 'cus_1',
      currency: 'BRL',
      amount_cents: 1500,
    };
    expect(computeRequestHash(reordered)).toBe(computeRequestHash(base));
  });

  it('muda quando qualquer campo muda', () => {
    expect(computeRequestHash({ ...base, amount_cents: 1501 })).not.toBe(
      computeRequestHash(base),
    );
    expect(computeRequestHash({ ...base, description: 'Outro' })).not.toBe(
      computeRequestHash(base),
    );
  });
});

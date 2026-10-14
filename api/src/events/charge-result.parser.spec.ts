import { MalformedEventError, parseChargeResult } from './charge-result.parser';

const eventId = '0b7c6f1e-4a43-4c4e-9a0e-0c1b7d2f5a11';
const chargeId = '5f0e2b8a-9d3c-4f6e-8a1b-2c3d4e5f6a7b';

describe('parseChargeResult', () => {
  it('aceita charge.succeeded', () => {
    const raw = {
      event_id: eventId,
      type: 'charge.succeeded',
      occurred_at: '2026-10-14T12:00:00Z',
      data: { charge_id: chargeId },
    };
    expect(parseChargeResult(raw)).toEqual({
      eventId,
      chargeId,
      outcome: 'succeeded',
    });
  });

  it('aceita charge.failed com reason', () => {
    const raw = {
      event_id: eventId,
      type: 'charge.failed',
      data: { charge_id: chargeId, reason: 'card_declined' },
    };
    expect(parseChargeResult(raw)).toEqual({
      eventId,
      chargeId,
      outcome: 'failed',
      reason: 'card_declined',
    });
  });

  it.each([
    ['não objeto', 'texto', /objeto JSON/],
    [
      'event_id inválido',
      {
        event_id: '123',
        type: 'charge.succeeded',
        data: { charge_id: chargeId },
      },
      /event_id.*"123"/,
    ],
    [
      'type desconhecido',
      {
        event_id: eventId,
        type: 'charge.created',
        data: { charge_id: chargeId },
      },
      /type.*"charge.created"/,
    ],
    [
      'charge_id ausente',
      { event_id: eventId, type: 'charge.succeeded', data: {} },
      /charge_id/,
    ],
    [
      'failed sem reason',
      {
        event_id: eventId,
        type: 'charge.failed',
        data: { charge_id: chargeId },
      },
      /reason/,
    ],
  ])('rejeita %s', (_label, raw, message) => {
    expect(() => parseChargeResult(raw)).toThrow(MalformedEventError);
    expect(() => parseChargeResult(raw)).toThrow(message);
  });
});

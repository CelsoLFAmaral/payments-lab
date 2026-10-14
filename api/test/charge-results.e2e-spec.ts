import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Charge } from '../src/charges/charge.entity';
import {
  ChargeNotFoundError,
  ChargeResultsHandler,
} from '../src/charges/charge-results.handler';
import { ChargesModule } from '../src/charges/charges.module';
import { ChargesService } from '../src/charges/charges.service';
import { DatabaseModule } from '../src/database/database.module';
import { MalformedEventError } from '../src/events/charge-result.parser';
import { truncateAll } from './helpers';

const body = {
  amount_cents: 1500,
  currency: 'BRL',
  customer_id: 'cus_1',
  description: 'Plano',
};

describe('ChargeResultsHandler (e2e)', () => {
  let dataSource: DataSource;
  let charges: ChargesService;
  let handler: ChargeResultsHandler;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ChargesModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    charges = app.get(ChargesService);
    handler = app.get(ChargeResultsHandler);
    close = () => app.close();
  });

  beforeEach(() => truncateAll(dataSource));
  afterAll(() => close());

  const succeeded = (chargeId: string, eventId = randomUUID()) => ({
    event_id: eventId,
    type: 'charge.succeeded',
    occurred_at: new Date().toISOString(),
    data: { charge_id: chargeId },
  });
  const failed = (chargeId: string, eventId = randomUUID()) => ({
    event_id: eventId,
    type: 'charge.failed',
    occurred_at: new Date().toISOString(),
    data: { charge_id: chargeId, reason: 'card_declined' },
  });
  const reload = (id: string) =>
    dataSource.getRepository(Charge).findOneByOrFail({ id });

  it('aplica charge.succeeded e devolve os ids para o log', async () => {
    const { charge } = await charges.create('k1', body);
    const event = succeeded(charge.id);
    expect(await handler.handle(event)).toEqual({
      outcome: 'applied',
      eventId: event.event_id,
      chargeId: charge.id,
    });
    expect((await reload(charge.id)).status).toBe('succeeded');
  });

  it('aplica charge.failed com motivo', async () => {
    const { charge } = await charges.create('k1', body);
    expect(await handler.handle(failed(charge.id))).toMatchObject({
      outcome: 'applied',
    });
    const updated = await reload(charge.id);
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('card_declined');
  });

  it('ignora evento repetido', async () => {
    const { charge } = await charges.create('k1', body);
    const event = succeeded(charge.id);
    await handler.handle(event);
    expect(await handler.handle(event)).toMatchObject({
      outcome: 'duplicate',
    });
  });

  it('resultado conflitante não muda cobrança finalizada e loga erro', async () => {
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { charge } = await charges.create('k1', body);
    await handler.handle(succeeded(charge.id));
    expect(await handler.handle(failed(charge.id))).toMatchObject({
      outcome: 'stale',
    });
    expect((await reload(charge.id)).status).toBe('succeeded');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('conflitante'),
    );
    errorLog.mockRestore();
  });

  it('mesmo status repetido com outro event_id só gera warn', async () => {
    const warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorLog = jest.spyOn(Logger.prototype, 'error');
    const { charge } = await charges.create('k1', body);
    await handler.handle(succeeded(charge.id));
    expect(await handler.handle(succeeded(charge.id))).toMatchObject({
      outcome: 'stale',
    });
    expect(warnLog).toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    warnLog.mockRestore();
    errorLog.mockRestore();
  });

  it('cobrança inexistente lança erro e não registra o evento', async () => {
    const event = succeeded(randomUUID());
    await expect(handler.handle(event)).rejects.toThrow(ChargeNotFoundError);
    const rows: unknown[] = await dataSource.query(
      'SELECT 1 FROM processed_events WHERE event_id = $1',
      [event.event_id],
    );
    expect(rows).toHaveLength(0);
  });

  it('evento mal formado lança MalformedEventError', async () => {
    await expect(handler.handle({ foo: 'bar' })).rejects.toThrow(
      MalformedEventError,
    );
  });
});

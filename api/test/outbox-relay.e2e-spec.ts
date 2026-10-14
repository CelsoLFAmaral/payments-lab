import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ChargesModule } from '../src/charges/charges.module';
import { ChargesService } from '../src/charges/charges.service';
import { DatabaseModule } from '../src/database/database.module';
import { EventEnvelope } from '../src/events/event-envelope';
import { MessagePublisher } from '../src/messaging/message-publisher';
import { OutboxRelay } from '../src/outbox/outbox-relay';
import { truncateAll } from './helpers';

class RecordingPublisher implements MessagePublisher {
  readonly published: {
    routingKey: string;
    envelope: EventEnvelope<unknown>;
  }[] = [];
  constructor(private readonly delayMs = 0) {}

  async publish(
    routingKey: string,
    envelope: EventEnvelope<unknown>,
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.published.push({ routingKey, envelope });
  }
}

const body = {
  amount_cents: 1500,
  currency: 'BRL',
  customer_id: 'cus_1',
  description: 'Plano',
};

describe('OutboxRelay (e2e)', () => {
  let dataSource: DataSource;
  let charges: ChargesService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ChargesModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    charges = app.get(ChargesService);
    close = () => app.close();
  });

  beforeEach(() => truncateAll(dataSource));
  afterAll(() => close());

  it('publica eventos pendentes uma única vez e marca published_at', async () => {
    await charges.create('k1', body);
    await charges.create('k2', body);
    const publisher = new RecordingPublisher();
    const relay = new OutboxRelay(dataSource, publisher, 1000);

    expect(await relay.publishBatch()).toBe(2);
    expect(await relay.publishBatch()).toBe(0);
    expect(publisher.published.map((item) => item.routingKey)).toEqual([
      'charge.created',
      'charge.created',
    ]);
    const [{ count }]: { count: string }[] = await dataSource.query(
      'SELECT count(*) FROM outbox WHERE published_at IS NULL',
    );
    expect(count).toBe('0');
  });

  it('relays concorrentes não publicam o mesmo evento duas vezes', async () => {
    for (let index = 0; index < 6; index++)
      await charges.create(`k${index}`, body);
    const publisher = new RecordingPublisher(20);
    const relayA = new OutboxRelay(dataSource, publisher, 1000);
    const relayB = new OutboxRelay(dataSource, publisher, 1000);

    await Promise.all([relayA.publishBatch(3), relayB.publishBatch(3)]);

    const ids = publisher.published.map((item) => item.envelope.event_id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it('falha ao publicar mantém o evento pendente', async () => {
    await charges.create('k1', body);
    const failing: MessagePublisher = {
      publish: () => Promise.reject(new Error('broker fora')),
    };
    const relay = new OutboxRelay(dataSource, failing, 1000);

    await expect(relay.publishBatch()).rejects.toThrow('broker fora');
    const [{ count }]: { count: string }[] = await dataSource.query(
      'SELECT count(*) FROM outbox WHERE published_at IS NULL',
    );
    expect(count).toBe('1');
  });
});

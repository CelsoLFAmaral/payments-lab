import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from '../health/health.controller';
import { HealthModule } from '../health/health.module';
import { ChargeResultsSubscriber } from './charge-results.subscriber';
import { MESSAGE_PUBLISHER } from './message-publisher';
import { MessagingModule } from './messaging.module';
import {
  CONSUMER_CONNECTION,
  PUBLISHER_CONNECTION,
  RABBITMQ_URL,
} from './rabbitmq.connection';

// O TypeOrmModule real é global; aqui um DataSource falso ocupa o lugar dele
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class FakeDatabaseModule {}

// Sem init(): nenhum hook de ciclo de vida conecta ao RabbitMQ
describe('MessagingModule wiring', () => {
  const publisherFake = { name: 'publisher' };
  const consumerFake = { name: 'consumer' };

  async function compile() {
    return Test.createTestingModule({
      imports: [FakeDatabaseModule, MessagingModule, HealthModule],
    })
      .overrideProvider(RABBITMQ_URL)
      .useValue('amqp://fake')
      .overrideProvider(PUBLISHER_CONNECTION)
      .useValue(publisherFake)
      .overrideProvider(CONSUMER_CONNECTION)
      .useValue(consumerFake)
      .compile();
  }

  it('injeta conexões distintas no publisher, no subscriber e no health', async () => {
    const moduleRef = await compile();

    const publisher = moduleRef.get<{ connection: unknown }>(MESSAGE_PUBLISHER);
    const subscriber = moduleRef.get<{ connection: unknown }>(
      ChargeResultsSubscriber,
    );
    const health = moduleRef.get<Record<string, unknown>>(HealthController);

    expect(publisherFake).not.toBe(consumerFake);
    expect(publisher.connection).toBe(publisherFake);
    expect(subscriber.connection).toBe(consumerFake);
    expect(health.publisherConnection).toBe(publisherFake);
    expect(health.consumerConnection).toBe(consumerFake);
  });
});

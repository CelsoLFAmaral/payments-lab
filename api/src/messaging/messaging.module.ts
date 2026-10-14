import { Module } from '@nestjs/common';
import { ChargesModule } from '../charges/charges.module';
import { requireEnv } from '../config';
import { ChargeResultsSubscriber } from './charge-results.subscriber';
import { MESSAGE_PUBLISHER } from './message-publisher';
import {
  CONSUMER_CONNECTION,
  PUBLISHER_CONNECTION,
  RABBITMQ_URL,
  RabbitMqConnection,
} from './rabbitmq.connection';
import { RabbitMqPublisher } from './rabbitmq.publisher';

// Conexões separadas: alarme de memória/disco bloqueia a conexão que publica,
// e os acks do consumidor não podem ficar presos junto
@Module({
  imports: [ChargesModule],
  providers: [
    { provide: RABBITMQ_URL, useFactory: () => requireEnv('RABBITMQ_URL') },
    {
      provide: PUBLISHER_CONNECTION,
      useFactory: (url: string) => new RabbitMqConnection(url, 'publisher'),
      inject: [RABBITMQ_URL],
    },
    {
      provide: CONSUMER_CONNECTION,
      useFactory: (url: string) => new RabbitMqConnection(url, 'consumer'),
      inject: [RABBITMQ_URL],
    },
    { provide: MESSAGE_PUBLISHER, useClass: RabbitMqPublisher },
    ChargeResultsSubscriber,
  ],
  exports: [MESSAGE_PUBLISHER, PUBLISHER_CONNECTION, CONSUMER_CONNECTION],
})
export class MessagingModule {}

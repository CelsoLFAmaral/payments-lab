import { Module } from '@nestjs/common';
import { ChargesModule } from '../charges/charges.module';
import { requireEnv } from '../config';
import { ChargeResultsSubscriber } from './charge-results.subscriber';
import { MESSAGE_PUBLISHER } from './message-publisher';
import { RABBITMQ_URL, RabbitMqConnection } from './rabbitmq.connection';
import { RabbitMqPublisher } from './rabbitmq.publisher';

@Module({
  imports: [ChargesModule],
  providers: [
    { provide: RABBITMQ_URL, useFactory: () => requireEnv('RABBITMQ_URL') },
    RabbitMqConnection,
    { provide: MESSAGE_PUBLISHER, useClass: RabbitMqPublisher },
    ChargeResultsSubscriber,
  ],
  exports: [MESSAGE_PUBLISHER, RabbitMqConnection],
})
export class MessagingModule {}

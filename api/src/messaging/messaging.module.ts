import { Module } from '@nestjs/common';
import { requireEnv } from '../config';
import { MESSAGE_PUBLISHER } from './message-publisher';
import { RABBITMQ_URL, RabbitMqConnection } from './rabbitmq.connection';
import { RabbitMqPublisher } from './rabbitmq.publisher';

@Module({
  providers: [
    { provide: RABBITMQ_URL, useFactory: () => requireEnv('RABBITMQ_URL') },
    RabbitMqConnection,
    { provide: MESSAGE_PUBLISHER, useClass: RabbitMqPublisher },
  ],
  exports: [MESSAGE_PUBLISHER, RabbitMqConnection],
})
export class MessagingModule {}

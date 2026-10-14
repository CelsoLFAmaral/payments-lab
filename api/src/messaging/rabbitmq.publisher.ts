import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventEnvelope } from '../events/event-envelope';
import { MessagePublisher } from './message-publisher';
import {
  PUBLISHER_CONNECTION,
  RabbitMqConnection,
} from './rabbitmq.connection';

const EXCHANGE = 'payments';

@Injectable()
export class RabbitMqPublisher
  implements MessagePublisher, OnApplicationBootstrap
{
  constructor(
    @Inject(PUBLISHER_CONNECTION)
    private readonly connection: RabbitMqConnection,
  ) {}

  // Abre já no boot: a conexão é preguiçosa e o /ready ficaria falso até o primeiro evento
  async onApplicationBootstrap(): Promise<void> {
    await this.connection.confirmChannel();
  }

  async publish(
    routingKey: string,
    envelope: EventEnvelope<unknown>,
  ): Promise<void> {
    const channel = await this.connection.confirmChannel();
    channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(envelope)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId: envelope.event_id,
      },
    );
    await channel.waitForConfirms();
  }
}

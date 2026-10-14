import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../events/event-envelope';
import { MessagePublisher } from './message-publisher';
import { RabbitMqConnection } from './rabbitmq.connection';

const EXCHANGE = 'payments';

@Injectable()
export class RabbitMqPublisher implements MessagePublisher {
  constructor(private readonly connection: RabbitMqConnection) {}

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

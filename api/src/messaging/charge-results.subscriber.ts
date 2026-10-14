import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import {
  ChargeNotFoundError,
  ChargeResultsHandler,
} from '../charges/charge-results.handler';
import { MalformedEventError } from '../events/charge-result.parser';
import { CONSUMER_CONNECTION, RabbitMqConnection } from './rabbitmq.connection';

const QUEUE = 'api.charge-results';
const PREFETCH = 10;

function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    error instanceof MalformedEventError ||
    error instanceof ChargeNotFoundError
  );
}

@Injectable()
export class ChargeResultsSubscriber implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChargeResultsSubscriber.name);

  constructor(
    @Inject(CONSUMER_CONNECTION)
    private readonly connection: RabbitMqConnection,
    private readonly handler: ChargeResultsHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channel = await this.connection.confirmChannel();
    await channel.prefetch(PREFETCH);
    await channel.consume(QUEUE, (message) => {
      if (message) void this.onMessage(channel, message);
    });
  }

  async onMessage(
    channel: Pick<Channel, 'ack' | 'nack'>,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const outcome = await this.handler.handle(
        JSON.parse(message.content.toString()),
      );
      this.logger.log(`Resultado processado: ${outcome}`);
      channel.ack(message);
    } catch (error) {
      // Falha permanente vai para a DLQ; falha transitória volta para a fila
      const permanent = isPermanentFailure(error);
      this.logger.error(
        `Falha ao processar resultado (${permanent ? 'DLQ' : 'requeue'}): ${(error as Error).message}`,
      );
      channel.nack(message, false, !permanent);
    }
  }
}

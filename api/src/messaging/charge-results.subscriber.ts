import {
  BeforeApplicationShutdown,
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

type ConsumerChannel = Pick<
  Channel,
  'ack' | 'nack' | 'prefetch' | 'consume' | 'cancel'
>;

@Injectable()
export class ChargeResultsSubscriber
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ChargeResultsSubscriber.name);
  private readonly inFlight = new Set<Promise<void>>();
  private channel?: ConsumerChannel;
  private consumerTag?: string;
  private shuttingDown = false;

  constructor(
    @Inject(CONSUMER_CONNECTION)
    private readonly connection: RabbitMqConnection,
    private readonly handler: ChargeResultsHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channel: ConsumerChannel = await this.connection.confirmChannel();
    await channel.prefetch(PREFETCH);
    const { consumerTag } = await channel.consume(QUEUE, (message) =>
      this.dispatch(channel, message),
    );
    this.channel = channel;
    this.consumerTag = consumerTag;
  }

  // Roda antes de a conexão fechar (onApplicationShutdown): para de receber
  // e deixa os handlers em andamento darem ack/nack num canal ainda aberto
  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.channel && this.consumerTag)
      await this.channel.cancel(this.consumerTag);
    await Promise.allSettled([...this.inFlight]);
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
    } catch (error) {
      // Falha permanente vai para a DLQ; falha transitória volta para a fila
      const permanent = isPermanentFailure(error);
      this.logger.error(
        `Falha ao processar resultado (${permanent ? 'DLQ' : 'requeue'}): ${(error as Error).message}`,
      );
      this.confirm(() => channel.nack(message, false, !permanent));
      return;
    }
    this.confirm(() => channel.ack(message));
  }

  private dispatch(
    channel: ConsumerChannel,
    message: ConsumeMessage | null,
  ): void {
    if (!message) return this.onConsumerCancelled();
    const handling = this.onMessage(channel, message).finally(() =>
      this.inFlight.delete(handling),
    );
    this.inFlight.add(handling);
  }

  // Broker cancelou o consumer (ex.: fila apagada). Crash-only, como a conexão
  private onConsumerCancelled(): void {
    if (this.shuttingDown) return;
    this.logger.error(
      `Consumer de ${QUEUE} cancelado pelo broker; finalizando processo`,
    );
    process.exit(1);
  }

  // Canal já fechado: a mensagem volta para a fila e a reentrega é deduplicada por event_id
  private confirm(settle: () => void): void {
    try {
      settle();
    } catch (error) {
      this.logger.error(
        `Falha ao confirmar mensagem: ${(error as Error).message}`,
      );
    }
  }
}

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfirmChannel, connect } from 'amqplib';

export const RABBITMQ_URL = Symbol('RABBITMQ_URL');

type AmqpConnection = Awaited<ReturnType<typeof connect>>;

@Injectable()
export class RabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConnection.name);
  private connection?: AmqpConnection;
  private channelPromise?: Promise<ConfirmChannel>;
  private shuttingDown = false;

  constructor(@Inject(RABBITMQ_URL) private readonly url: string) {}

  // Guarda a promise para chamadas concorrentes compartilharem a mesma conexão
  confirmChannel(): Promise<ConfirmChannel> {
    this.channelPromise ??= this.open();
    return this.channelPromise;
  }

  isOpen(): boolean {
    return this.connection !== undefined;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.connection?.close();
  }

  private async open(): Promise<ConfirmChannel> {
    const connection = await connect(this.url);
    connection.on('error', (error: Error) =>
      this.logger.error(`Erro na conexão RabbitMQ: ${error.message}`),
    );
    // Crash-only: reconectar e reassinar consumidores é complexo; o Docker reinicia o processo
    connection.on('close', () => {
      if (this.shuttingDown) return;
      this.logger.error(
        'Conexão RabbitMQ encerrada inesperadamente; finalizando processo',
      );
      process.exit(1);
    });
    this.connection = connection;
    return connection.createConfirmChannel();
  }
}

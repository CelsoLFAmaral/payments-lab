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
    let connection: AmqpConnection;
    try {
      connection = await connect(this.url);
    } catch (error) {
      return this.crash('Falha ao conectar no RabbitMQ', error as Error);
    }
    this.connection = connection;
    connection.on('error', (error: Error) =>
      this.logger.error(`Erro na conexão RabbitMQ: ${error.message}`),
    );
    // Crash-only: reconectar e reassinar consumidores é complexo; o Docker reinicia o processo
    connection.on('close', () => this.exitUnlessShuttingDown('Conexão'));
    try {
      const channel = await connection.createConfirmChannel();
      this.watchChannel(channel);
      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      return this.crash('Falha ao criar canal RabbitMQ', error as Error);
    }
  }

  private watchChannel(channel: ConfirmChannel): void {
    channel.on('error', (error: Error) =>
      this.logger.error(`Erro no canal RabbitMQ: ${error.message}`),
    );
    channel.on('close', () => this.exitUnlessShuttingDown('Canal'));
  }

  private exitUnlessShuttingDown(what: string): void {
    if (this.shuttingDown) return;
    this.logger.error(
      `${what} RabbitMQ encerrado inesperadamente; finalizando processo`,
    );
    process.exit(1);
  }

  private crash(message: string, error: Error): never {
    this.logger.error(`${message}: ${error.message}`);
    if (!this.shuttingDown) process.exit(1);
    throw error;
  }
}

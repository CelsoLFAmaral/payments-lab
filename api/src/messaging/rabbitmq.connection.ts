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
    if (this.shuttingDown) {
      await connection.close();
      throw new Error('Conexão RabbitMQ aberta durante o encerramento');
    }
    let channel: ConfirmChannel;
    try {
      channel = await connection.createConfirmChannel();
    } catch (error) {
      // Sem listeners ainda: o close() não pode disparar exit antes de logar o erro real
      await connection.close().catch(() => undefined);
      return this.crash('Falha ao criar canal RabbitMQ', error as Error);
    }
    this.connection = connection;
    connection.on('error', (error: Error) =>
      this.logger.error(`Erro na conexão RabbitMQ: ${error.message}`),
    );
    // Crash-only: reconectar e reassinar consumidores é complexo; o Docker reinicia o processo
    connection.on('close', () => this.exitUnlessShuttingDown('conexão'));
    this.watchChannel(channel);
    return channel;
  }

  private watchChannel(channel: ConfirmChannel): void {
    channel.on('error', (error: Error) =>
      this.logger.error(`Erro no canal RabbitMQ: ${error.message}`),
    );
    channel.on('close', () => this.exitUnlessShuttingDown('canal'));
  }

  private exitUnlessShuttingDown(what: string): void {
    if (this.shuttingDown) return;
    this.logger.error(
      `RabbitMQ (${what}) encerrou inesperadamente; finalizando processo`,
    );
    process.exit(1);
  }

  private crash(message: string, error: Error): never {
    this.logger.error(`${message}: ${error.message}`);
    if (!this.shuttingDown) process.exit(1);
    throw error;
  }
}

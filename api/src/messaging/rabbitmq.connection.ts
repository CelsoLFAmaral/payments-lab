import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfirmChannel, connect } from 'amqplib';

export const RABBITMQ_URL = Symbol('RABBITMQ_URL');
export const PUBLISHER_CONNECTION = Symbol('PUBLISHER_CONNECTION');
export const CONSUMER_CONNECTION = Symbol('CONSUMER_CONNECTION');

type AmqpConnection = Awaited<ReturnType<typeof connect>>;

export class RabbitMqConnection implements OnApplicationShutdown {
  private readonly logger: Logger;
  private connection?: AmqpConnection;
  private channelPromise?: Promise<ConfirmChannel>;
  private shuttingDown = false;

  // role identifica a conexão nos logs e no management (publisher/consumer)
  constructor(
    private readonly url: string,
    private readonly role: string,
  ) {
    this.logger = new Logger(`${RabbitMqConnection.name}:${role}`);
  }

  // Guarda a promise para chamadas concorrentes compartilharem a mesma conexão
  confirmChannel(): Promise<ConfirmChannel> {
    this.channelPromise ??= this.open();
    return this.channelPromise;
  }

  isOpen(): boolean {
    return this.connection !== undefined;
  }

  // onApplicationShutdown (e não onModuleDestroy): o subscriber drena os
  // handlers em beforeApplicationShutdown, que o Nest chama entre os dois
  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.connection?.close();
  }

  private async open(): Promise<ConfirmChannel> {
    let connection: AmqpConnection;
    try {
      connection = await connect(this.url, {
        clientProperties: { connection_name: `api-${this.role}` },
      });
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

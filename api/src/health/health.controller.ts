import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CONSUMER_CONNECTION,
  PUBLISHER_CONNECTION,
  RabbitMqConnection,
} from '../messaging/rabbitmq.connection';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PUBLISHER_CONNECTION)
    private readonly publisherConnection: RabbitMqConnection,
    @Inject(CONSUMER_CONNECTION)
    private readonly consumerConnection: RabbitMqConnection,
  ) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ database: boolean; rabbitmq: boolean }> {
    const database = await this.dataSource.query('SELECT 1').then(
      () => true,
      () => false,
    );
    const rabbitmq =
      this.publisherConnection.isOpen() && this.consumerConnection.isOpen();
    if (!database || !rabbitmq)
      throw new ServiceUnavailableException({ database, rabbitmq });
    return { database, rabbitmq };
  }
}

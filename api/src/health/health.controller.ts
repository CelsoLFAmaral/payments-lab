import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMqConnection } from '../messaging/rabbitmq.connection';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitMqConnection,
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
    const rabbitmq = this.rabbit.isOpen();
    if (!database || !rabbitmq)
      throw new ServiceUnavailableException({ database, rabbitmq });
    return { database, rabbitmq };
  }
}

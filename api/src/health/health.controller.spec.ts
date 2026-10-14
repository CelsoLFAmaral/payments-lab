import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMqConnection } from '../messaging/rabbitmq.connection';
import { HealthController } from './health.controller';

function controllerWith(
  databaseUp: boolean,
  rabbitUp: boolean,
): HealthController {
  const dataSource = {
    query: () =>
      databaseUp ? Promise.resolve([]) : Promise.reject(new Error('down')),
  };
  const rabbit = { isOpen: () => rabbitUp };
  return new HealthController(
    dataSource as unknown as DataSource,
    rabbit as RabbitMqConnection,
  );
}

describe('HealthController', () => {
  it('responde ok no /health', () => {
    expect(controllerWith(true, true).health()).toEqual({ status: 'ok' });
  });

  it('/ready ok quando banco e RabbitMQ estão de pé', async () => {
    await expect(controllerWith(true, true).ready()).resolves.toEqual({
      database: true,
      rabbitmq: true,
    });
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    '/ready 503 quando database=%s rabbitmq=%s',
    async (databaseUp, rabbitUp) => {
      await expect(
        controllerWith(databaseUp, rabbitUp).ready(),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );
});

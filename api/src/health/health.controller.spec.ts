import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMqConnection } from '../messaging/rabbitmq.connection';
import { HealthController } from './health.controller';

function controllerWith(
  databaseUp: boolean,
  publisherUp: boolean,
  consumerUp: boolean,
): HealthController {
  const dataSource = {
    query: () =>
      databaseUp ? Promise.resolve([]) : Promise.reject(new Error('down')),
  };
  const connection = (up: boolean) =>
    ({ isOpen: () => up }) as RabbitMqConnection;
  return new HealthController(
    dataSource as unknown as DataSource,
    connection(publisherUp),
    connection(consumerUp),
  );
}

describe('HealthController', () => {
  it('responde ok no /health', () => {
    expect(controllerWith(true, true, true).health()).toEqual({ status: 'ok' });
  });

  it('/ready ok quando banco e as duas conexões RabbitMQ estão de pé', async () => {
    await expect(controllerWith(true, true, true).ready()).resolves.toEqual({
      database: true,
      rabbitmq: true,
    });
  });

  it.each([
    [false, true, true],
    [true, false, true],
    [true, true, false],
  ])(
    '/ready 503 quando database=%s publicação=%s consumo=%s',
    async (databaseUp, publisherUp, consumerUp) => {
      await expect(
        controllerWith(databaseUp, publisherUp, consumerUp).ready(),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );
});

import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { connect } from 'amqplib';
import { RabbitMqConnection } from './rabbitmq.connection';

jest.mock('amqplib');

const connectMock = connect as unknown as jest.Mock;

function fakeBroker() {
  const channel = Object.assign(new EventEmitter(), {});
  const connection: EventEmitter & {
    createConfirmChannel: jest.Mock;
    close: jest.Mock;
  } = Object.assign(new EventEmitter(), {
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockImplementation(() => {
      connection.emit('close');
      return Promise.resolve();
    }),
  });
  connectMock.mockResolvedValue(connection);
  return { channel, connection };
}

describe('RabbitMqConnection (crash-only)', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    connectMock.mockReset();
  });

  it('encerra o processo quando connect() falha', async () => {
    connectMock.mockRejectedValue(new Error('refused'));
    const rabbit = new RabbitMqConnection('amqp://x', 'publisher');
    await rabbit.confirmChannel().catch(() => undefined);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('identifica a conexão pelo papel no management', async () => {
    fakeBroker();
    const rabbit = new RabbitMqConnection('amqp://x', 'consumer');
    await rabbit.confirmChannel();
    expect(connectMock).toHaveBeenCalledWith('amqp://x', {
      clientProperties: { connection_name: 'api-consumer' },
    });
  });

  it('encerra o processo quando o canal fecha', async () => {
    const { channel } = fakeBroker();
    const rabbit = new RabbitMqConnection('amqp://x', 'publisher');
    await rabbit.confirmChannel();
    channel.emit('close');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('não encerra o processo se o close ocorre após o shutdown', async () => {
    const { channel } = fakeBroker();
    const rabbit = new RabbitMqConnection('amqp://x', 'publisher');
    await rabbit.confirmChannel();
    await rabbit.onApplicationShutdown();
    channel.emit('close');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('loga o erro original e fecha a conexão quando o canal falha ao abrir', async () => {
    const { connection } = fakeBroker();
    connection.createConfirmChannel.mockRejectedValue(
      new Error('channel boom'),
    );
    const logSpy = jest.spyOn(Logger.prototype, 'error');
    const rabbit = new RabbitMqConnection('amqp://x', 'publisher');
    await rabbit.confirmChannel().catch(() => undefined);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('channel boom'),
    );
    expect(connection.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorLogIndex = logSpy.mock.calls.findIndex(([m]) =>
      String(m).includes('channel boom'),
    );
    expect(logSpy.mock.invocationCallOrder[errorLogIndex]).toBeLessThan(
      exitSpy.mock.invocationCallOrder[0],
    );
  });
});

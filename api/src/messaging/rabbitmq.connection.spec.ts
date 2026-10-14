import { EventEmitter } from 'events';
import { connect } from 'amqplib';
import { RabbitMqConnection } from './rabbitmq.connection';

jest.mock('amqplib');

const connectMock = connect as unknown as jest.Mock;

function fakeBroker() {
  const channel = Object.assign(new EventEmitter(), {});
  const connection = Object.assign(new EventEmitter(), {
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
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
    const rabbit = new RabbitMqConnection('amqp://x');
    await rabbit.confirmChannel().catch(() => undefined);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('encerra o processo quando o canal fecha', async () => {
    const { channel } = fakeBroker();
    const rabbit = new RabbitMqConnection('amqp://x');
    await rabbit.confirmChannel();
    channel.emit('close');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('não encerra o processo se o close ocorre após o destroy', async () => {
    const { channel } = fakeBroker();
    const rabbit = new RabbitMqConnection('amqp://x');
    await rabbit.confirmChannel();
    await rabbit.onModuleDestroy();
    channel.emit('close');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

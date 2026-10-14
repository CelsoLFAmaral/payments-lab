import { Logger } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import {
  ChargeNotFoundError,
  ChargeResultsHandler,
} from '../charges/charge-results.handler';
import { MalformedEventError } from '../events/charge-result.parser';
import { RabbitMqConnection } from './rabbitmq.connection';
import { ChargeResultsSubscriber } from './charge-results.subscriber';

const message = (content: string) =>
  ({ content: Buffer.from(content) }) as ConsumeMessage;

type OnConsume = (message: ConsumeMessage | null) => void;

function setup(handle: ChargeResultsHandler['handle']) {
  const handler = { handle } as ChargeResultsHandler;
  const consumer: { deliver?: OnConsume } = {};
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn((_queue: string, onConsume: OnConsume) => {
      consumer.deliver = onConsume;
      return Promise.resolve({ consumerTag: 'tag-1' });
    }),
  };
  const connection = {
    confirmChannel: () => Promise.resolve(channel),
  } as unknown as RabbitMqConnection;
  const subscriber = new ChargeResultsSubscriber(connection, handler);
  return { subscriber, channel, consumer };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('ChargeResultsSubscriber.onMessage', () => {
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('dá ack quando o handler processa', async () => {
    const { subscriber, channel } = setup(() => Promise.resolve('applied'));
    const msg = message('{}');
    await subscriber.onMessage(channel, msg);
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('JSON inválido vai para a DLQ (nack sem requeue)', async () => {
    const { subscriber, channel } = setup(() => Promise.resolve('applied'));
    const msg = message('não é json');
    await subscriber.onMessage(channel, msg);
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it.each([
    ['MalformedEventError', new MalformedEventError('x')],
    ['ChargeNotFoundError', new ChargeNotFoundError('x')],
  ])('%s vai para a DLQ', async (_label, error) => {
    const { subscriber, channel } = setup(() => Promise.reject(error));
    const msg = message('{}');
    await subscriber.onMessage(channel, msg);
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('erro inesperado (ex.: banco fora) volta para a fila', async () => {
    const { subscriber, channel } = setup(() =>
      Promise.reject(new Error('db down')),
    );
    const msg = message('{}');
    await subscriber.onMessage(channel, msg);
    expect(channel.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('falha no ack só é logada, sem rejeitar', async () => {
    const { subscriber, channel } = setup(() => Promise.resolve('applied'));
    channel.ack.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    await expect(
      subscriber.onMessage(channel, message('{}')),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Channel closed'),
    );
  });

  it('falha no nack só é logada, sem rejeitar', async () => {
    const { subscriber, channel } = setup(() =>
      Promise.reject(new Error('db down')),
    );
    channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    await expect(
      subscriber.onMessage(channel, message('{}')),
    ).resolves.toBeUndefined();
  });
});

describe('ChargeResultsSubscriber (ciclo de vida)', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('no desligamento cancela o consumer e espera os handlers em andamento', async () => {
    const pending = deferred<'applied'>();
    const { subscriber, channel, consumer } = setup(() => pending.promise);
    await subscriber.onApplicationBootstrap();
    const msg = message('{}');
    consumer.deliver!(msg);

    let drained = false;
    const shutdown = subscriber
      .beforeApplicationShutdown()
      .then(() => (drained = true));
    await new Promise((resolve) => setImmediate(resolve));
    expect(channel.cancel).toHaveBeenCalledWith('tag-1');
    expect(drained).toBe(false);

    pending.resolve('applied');
    await shutdown;
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('consumer cancelado pelo broker encerra o processo', async () => {
    const { subscriber, consumer } = setup(() => Promise.resolve('applied'));
    await subscriber.onApplicationBootstrap();
    consumer.deliver!(null);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('cancelamento durante o desligamento não encerra o processo', async () => {
    const { subscriber, consumer } = setup(() => Promise.resolve('applied'));
    await subscriber.onApplicationBootstrap();
    await subscriber.beforeApplicationShutdown();
    consumer.deliver!(null);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

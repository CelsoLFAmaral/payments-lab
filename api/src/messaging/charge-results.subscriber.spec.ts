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

function setup(handle: ChargeResultsHandler['handle']) {
  const handler = { handle } as ChargeResultsHandler;
  const subscriber = new ChargeResultsSubscriber(
    {} as RabbitMqConnection,
    handler,
  );
  const channel = { ack: jest.fn(), nack: jest.fn() };
  return { subscriber, channel };
}

describe('ChargeResultsSubscriber.onMessage', () => {
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
});

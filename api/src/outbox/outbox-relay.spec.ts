import type { DataSource } from 'typeorm';
import type { MessagePublisher } from '../messaging/message-publisher';
import { OutboxRelay, parseOutboxIntervalMs } from './outbox-relay';

describe('OutboxRelay', () => {
  const intervalMs = 100;
  let relay: OutboxRelay;

  beforeEach(() => {
    jest.useFakeTimers();
    relay = new OutboxRelay(
      {} as DataSource,
      {} as MessagePublisher,
      intervalMs,
    );
  });

  afterEach(() => {
    relay.onModuleDestroy();
    jest.useRealTimers();
  });

  it('não inicia outro ciclo enquanto o anterior está em andamento', async () => {
    const spy = jest
      .spyOn(relay, 'publishBatch')
      .mockReturnValue(new Promise(() => undefined));
    relay.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(intervalMs * 5);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('continua agendando após cada ciclo e para após o destroy', async () => {
    const spy = jest.spyOn(relay, 'publishBatch').mockResolvedValue(0);
    relay.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(intervalMs * 3);
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    relay.onModuleDestroy();
    const calls = spy.mock.calls.length;
    await jest.advanceTimersByTimeAsync(intervalMs * 5);
    expect(spy).toHaveBeenCalledTimes(calls);
  });
});

describe('parseOutboxIntervalMs', () => {
  it.each([
    [undefined, 1000],
    ['', 1000],
    ['abc', 1000],
    ['0', 1000],
    ['-5', 1000],
    ['1.5', 1000],
    ['2500', 2500],
  ])('%p -> %p', (raw, expected) => {
    expect(parseOutboxIntervalMs(raw)).toBe(expected);
  });
});

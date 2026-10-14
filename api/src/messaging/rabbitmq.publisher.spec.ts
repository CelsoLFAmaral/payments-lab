import { RabbitMqConnection } from './rabbitmq.connection';
import { RabbitMqPublisher } from './rabbitmq.publisher';

describe('RabbitMqPublisher', () => {
  it('abre a conexão de publicação no boot para o /ready refletir o broker', async () => {
    const confirmChannel = jest.fn().mockResolvedValue({});
    const publisher = new RabbitMqPublisher({
      confirmChannel,
    } as unknown as RabbitMqConnection);
    await publisher.onApplicationBootstrap();
    expect(confirmChannel).toHaveBeenCalled();
  });
});

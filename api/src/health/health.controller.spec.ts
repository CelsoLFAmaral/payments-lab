import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde ok no /health', () => {
    const controller = new HealthController();
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});

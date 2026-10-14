import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ChargeResult,
  parseChargeResult,
} from '../events/charge-result.parser';
import { Charge } from './charge.entity';
import { canTransition } from './charge-status';

export class ChargeNotFoundError extends Error {}

type HandleOutcome = 'applied' | 'duplicate' | 'stale';

@Injectable()
export class ChargeResultsHandler {
  private readonly logger = new Logger(ChargeResultsHandler.name);

  constructor(private readonly dataSource: DataSource) {}

  async handle(raw: unknown): Promise<HandleOutcome> {
    const result = parseChargeResult(raw);
    return this.dataSource.transaction(async (manager) => {
      if (!(await this.registerEvent(manager, result.eventId)))
        return 'duplicate';
      return this.applyResult(manager, result);
    });
  }

  // INSERT ... ON CONFLICT na mesma transação: se a aplicação falhar, o registro também volta
  private async registerEvent(
    manager: EntityManager,
    eventId: string,
  ): Promise<boolean> {
    const inserted: unknown[] = await manager.query(
      'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
      [eventId],
    );
    return inserted.length > 0;
  }

  private async applyResult(
    manager: EntityManager,
    result: ChargeResult,
  ): Promise<HandleOutcome> {
    const charge = await manager.findOne(Charge, {
      where: { id: result.chargeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!charge)
      throw new ChargeNotFoundError(
        `Cobrança ${result.chargeId} do evento ${result.eventId} não existe`,
      );
    if (!canTransition(charge.status, result.outcome)) {
      this.logger.warn(
        `Evento ${result.eventId} ignorado: cobrança ${charge.id} já está ${charge.status}`,
      );
      return 'stale';
    }
    charge.status = result.outcome;
    charge.failureReason = result.outcome === 'failed' ? result.reason : null;
    await manager.save(charge);
    return 'applied';
  }
}

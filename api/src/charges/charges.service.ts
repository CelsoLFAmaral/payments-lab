import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { buildEnvelope, ChargeCreatedData } from '../events/event-envelope';
import { OutboxEvent } from '../outbox/outbox-event.entity';
import { Charge } from './charge.entity';
import { ChargeRequest, computeRequestHash } from './request-hash';

const IDEMPOTENCY_CONSTRAINT = 'charges_idempotency_key_key';

function isIdempotencyViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === '23505' &&
    driverError.constraint === IDEMPOTENCY_CONSTRAINT
  );
}

@Injectable()
export class ChargesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    idempotencyKey: string,
    request: ChargeRequest,
  ): Promise<{ charge: Charge; created: boolean }> {
    const requestHash = computeRequestHash(request);
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.replay(existing, requestHash);
    try {
      const charge = await this.dataSource.transaction((manager) =>
        this.insertWithOutbox(manager, idempotencyKey, requestHash, request),
      );
      return { charge, created: true };
    } catch (error) {
      if (!isIdempotencyViolation(error)) throw error;
      // Outra requisição com a mesma key commitou primeiro; o insert dela já está visível
      const winner = await this.findByIdempotencyKey(idempotencyKey);
      return this.replay(winner as Charge, requestHash);
    }
  }

  findById(id: string): Promise<Charge | null> {
    return this.dataSource.getRepository(Charge).findOneBy({ id });
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<Charge | null> {
    return this.dataSource.getRepository(Charge).findOneBy({ idempotencyKey });
  }

  private replay(
    existing: Charge,
    requestHash: string,
  ): { charge: Charge; created: boolean } {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        `Idempotency-Key já usada com outro corpo (cobrança ${existing.id}); reenvie o corpo original ou use outra key`,
      );
    }
    return { charge: existing, created: false };
  }

  private async insertWithOutbox(
    manager: EntityManager,
    idempotencyKey: string,
    requestHash: string,
    request: ChargeRequest,
  ): Promise<Charge> {
    const charge = await manager.save(
      manager.create(Charge, {
        id: randomUUID(),
        amountCents: request.amount_cents,
        currency: request.currency,
        customerId: request.customer_id,
        description: request.description,
        status: 'pending',
        failureReason: null,
        idempotencyKey,
        requestHash,
      }),
    );
    const envelope = buildEnvelope<ChargeCreatedData>('charge.created', {
      charge_id: charge.id,
      amount_cents: charge.amountCents,
      currency: charge.currency,
    });
    await manager.insert(OutboxEvent, {
      eventId: envelope.event_id,
      eventType: envelope.type,
      payload: envelope,
    });
    return charge;
  }
}

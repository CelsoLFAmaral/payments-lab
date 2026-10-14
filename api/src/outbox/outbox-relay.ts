import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MESSAGE_PUBLISHER } from '../messaging/message-publisher';
import type { MessagePublisher } from '../messaging/message-publisher';
import { OutboxEvent } from './outbox-event.entity';

export const OUTBOX_INTERVAL_MS = Symbol('OUTBOX_INTERVAL_MS');

@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: MessagePublisher,
    @Inject(OUTBOX_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  // SKIP LOCKED deixa várias instâncias rodarem o relay sem pegar as mesmas linhas.
  // Se publicar falhar no meio, a transação volta e o lote inteiro é reenviado: at-least-once.
  publishBatch(limit = 50): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('outbox')
        .where('outbox.published_at IS NULL')
        .orderBy('outbox.id')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const event of pending) {
        await this.publisher.publish(event.eventType, event.payload);
        await manager.update(OutboxEvent, event.id, {
          publishedAt: new Date(),
        });
      }
      return pending.length;
    });
  }

  private async tick(): Promise<void> {
    try {
      await this.publishBatch();
    } catch (error) {
      this.logger.error(
        `Falha ao publicar outbox: ${(error as Error).message}`,
      );
    }
  }
}

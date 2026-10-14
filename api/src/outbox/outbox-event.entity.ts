import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { EventEnvelope } from '../events/event-envelope';

@Entity('outbox')
export class OutboxEvent {
  // bigserial chega como string do driver; só é usado para ordenar e atualizar
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: EventEnvelope<unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}

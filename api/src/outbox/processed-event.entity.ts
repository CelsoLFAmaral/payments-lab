import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}

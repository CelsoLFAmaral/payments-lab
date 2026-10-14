import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../database/bigint.transformer';
import type { ChargeStatus } from './charge-status';

@Entity('charges')
export class Charge {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({
    name: 'amount_cents',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  amountCents!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  status!: ChargeStatus;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

import { DataSourceOptions } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { OutboxEvent } from '../outbox/outbox-event.entity';
import { ProcessedEvent } from '../outbox/processed-event.entity';
import { CreateInitialSchema1760400000000 } from './migrations/1760400000000-CreateInitialSchema';

export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Charge, OutboxEvent, ProcessedEvent],
    migrations: [CreateInitialSchema1760400000000],
    synchronize: false,
  };
}

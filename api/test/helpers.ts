import { DataSource } from 'typeorm';

export function testDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgres://payments:payments@localhost:5432/payments_test'
  );
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE charges, outbox, processed_events RESTART IDENTITY',
  );
}

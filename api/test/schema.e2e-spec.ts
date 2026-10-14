import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source';
import { testDatabaseUrl } from './helpers';

describe('schema', () => {
  const dataSource = new DataSource(buildDataSourceOptions(testDatabaseUrl()));

  beforeAll(() => dataSource.initialize());
  afterAll(() => dataSource.destroy());

  it('cria as três tabelas', async () => {
    const rows: { table_name: string }[] = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['charges', 'outbox', 'processed_events']),
    );
  });

  it('rejeita amount_cents <= 0 no banco', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO charges (id, amount_cents, currency, customer_id, description, status, idempotency_key, request_hash)
         VALUES (gen_random_uuid(), 0, 'BRL', 'c', 'd', 'pending', 'k', repeat('a', 64))`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

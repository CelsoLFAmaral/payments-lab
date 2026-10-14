import { DataSource } from 'typeorm';

export function testDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    'postgres://payments:payments@localhost:5432/payments_test';
  const name = new URL(url).pathname.slice(1);
  // A suíte apaga (global-setup) e trunca tabelas; nunca pode rodar num banco real
  if (!name.endsWith('_test')) {
    throw new Error(
      `Testes e2e recusados: DATABASE_URL aponta para o banco "${name}"; o nome precisa terminar em _test para evitar apagar dados reais`,
    );
  }
  return url;
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE charges, outbox, processed_events RESTART IDENTITY',
  );
}

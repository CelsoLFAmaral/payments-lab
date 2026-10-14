import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source';
import { testDatabaseUrl } from './helpers';

// Recria o schema do banco de teste do zero a cada execução da suíte
export default async function globalSetup(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions(testDatabaseUrl()));
  await dataSource.initialize();
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

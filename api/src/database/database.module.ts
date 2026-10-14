import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { requireEnv } from '../config';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(requireEnv('DATABASE_URL')),
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}

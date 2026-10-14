import { Module } from '@nestjs/common';
import { ChargesModule } from './charges/charges.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [DatabaseModule, ChargesModule, HealthModule] })
export class AppModule {}

import { Module } from '@nestjs/common';
import { ChargesModule } from './charges/charges.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [DatabaseModule, ChargesModule, OutboxModule, HealthModule],
})
export class AppModule {}

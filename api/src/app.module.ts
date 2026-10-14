import { Module } from '@nestjs/common';
import { ChargesModule } from './charges/charges.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MessagingModule } from './messaging/messaging.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    DatabaseModule,
    ChargesModule,
    MessagingModule,
    OutboxModule,
    HealthModule,
  ],
})
export class AppModule {}

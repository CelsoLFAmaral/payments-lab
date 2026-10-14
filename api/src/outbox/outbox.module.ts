import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import {
  OUTBOX_INTERVAL_MS,
  OutboxRelay,
  parseOutboxIntervalMs,
} from './outbox-relay';

@Module({
  imports: [MessagingModule],
  providers: [
    {
      provide: OUTBOX_INTERVAL_MS,
      useFactory: () => parseOutboxIntervalMs(process.env.OUTBOX_INTERVAL_MS),
    },
    OutboxRelay,
  ],
})
export class OutboxModule {}

import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { OUTBOX_INTERVAL_MS, OutboxRelay } from './outbox-relay';

@Module({
  imports: [MessagingModule],
  providers: [
    {
      provide: OUTBOX_INTERVAL_MS,
      useFactory: () => Number(process.env.OUTBOX_INTERVAL_MS ?? 1000),
    },
    OutboxRelay,
  ],
})
export class OutboxModule {}

import { Module } from '@nestjs/common';
import { ChargeResultsHandler } from './charge-results.handler';
import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';

@Module({
  controllers: [ChargesController],
  providers: [ChargesService, ChargeResultsHandler],
  exports: [ChargesService, ChargeResultsHandler],
})
export class ChargesModule {}

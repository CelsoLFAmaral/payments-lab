import { MigrationInterface, QueryRunner } from 'typeorm';

// Mesmo limite do DTO (Number.MAX_SAFE_INTEGER): o bigint vira number na API
export class LimitAmountCents1760500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE charges ADD CONSTRAINT charges_amount_cents_max CHECK (amount_cents <= 9007199254740991)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE charges DROP CONSTRAINT charges_amount_cents_max`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1760400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE charges (
        id uuid PRIMARY KEY,
        amount_cents bigint NOT NULL CHECK (amount_cents > 0),
        currency char(3) NOT NULL,
        customer_id text NOT NULL,
        description text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
        failure_reason text,
        idempotency_key text NOT NULL,
        request_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT charges_idempotency_key_key UNIQUE (idempotency_key)
      )`);
    await queryRunner.query(`
      CREATE TABLE outbox (
        id bigserial PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      )`);
    // Índice parcial: o relay só procura linhas ainda não publicadas
    await queryRunner.query(
      `CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE processed_events (
        event_id uuid PRIMARY KEY,
        processed_at timestamptz NOT NULL DEFAULT now()
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE processed_events`);
    await queryRunner.query(`DROP TABLE outbox`);
    await queryRunner.query(`DROP TABLE charges`);
  }
}

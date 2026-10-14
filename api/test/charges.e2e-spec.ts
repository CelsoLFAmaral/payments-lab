import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/app.setup';
import { ChargesModule } from '../src/charges/charges.module';
import { DatabaseModule } from '../src/database/database.module';
import { truncateAll } from './helpers';

type ResBody = { id: string; message: string | string[] };
const json = (res: request.Response) => res.body as ResBody;

const body = {
  amount_cents: 1500,
  currency: 'BRL',
  customer_id: 'cus_1',
  description: 'Plano mensal',
};

describe('charges (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ChargesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(() => truncateAll(dataSource));
  afterAll(() => app.close());

  const post = (key: string | null, payload: object) => {
    const req = request(app.getHttpServer()).post('/charges');
    return key
      ? req.set('Idempotency-Key', key).send(payload)
      : req.send(payload);
  };

  it('cria cobrança pending e grava charge.created no outbox', async () => {
    const res = await post('key-1', body).expect(201);
    expect(res.body).toMatchObject({
      ...body,
      status: 'pending',
      failure_reason: null,
    });

    const outbox: {
      event_type: string;
      payload: { data: { charge_id: string; amount_cents: number } };
    }[] = await dataSource.query('SELECT event_type, payload FROM outbox');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].event_type).toBe('charge.created');
    expect(outbox[0].payload.data).toEqual({
      charge_id: json(res).id,
      amount_cents: 1500,
      currency: 'BRL',
    });
  });

  it('exige Idempotency-Key', async () => {
    await post(null, body).expect(400);
  });

  it.each([
    ['float', { ...body, amount_cents: 15.5 }, /recebido: 15.5/],
    ['string', { ...body, amount_cents: '1500' }, /recebido: "1500"/],
    ['zero', { ...body, amount_cents: 0 }, /recebido: 0/],
    ['moeda', { ...body, currency: 'USD' }, /recebido: "USD"/],
    ['campo extra', { ...body, extra: true }, /extra/],
  ])('rejeita corpo inválido: %s', async (_label, payload, message) => {
    const res = await post('key-x', payload).expect(400);
    expect([json(res).message].flat().join(' | ')).toMatch(message);
  });

  // Corpo cru: num literal JS 9007199254740993 já viraria ...992 antes do envio
  it.each([
    ['9007199254740993', /recebido: 9007199254740992/],
    ['1e20', /recebido: 100000000000000000000/],
  ])(
    'rejeita amount_cents acima de Number.MAX_SAFE_INTEGER: %s',
    async (rawAmount, message) => {
      const raw = `{"amount_cents":${rawAmount},"currency":"BRL","customer_id":"cus_1","description":"x"}`;
      const res = await request(app.getHttpServer())
        .post('/charges')
        .set('Idempotency-Key', 'key-big')
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(400);
      const text = [json(res).message].flat().join(' | ');
      expect(text).toMatch(message);
      expect(text).toMatch(/9007199254740991/);
    },
  );

  it('replay com mesmo corpo devolve a original com 200', async () => {
    const first = await post('key-2', body).expect(201);
    const replay = await post('key-2', { ...body }).expect(200);
    expect(json(replay).id).toBe(json(first).id);
    const [{ count }]: { count: string }[] = await dataSource.query(
      'SELECT count(*) FROM outbox',
    );
    expect(count).toBe('1');
  });

  it('mesma key com corpo diferente devolve 409', async () => {
    await post('key-3', body).expect(201);
    await post('key-3', { ...body, amount_cents: 9900 }).expect(409);
  });

  it('requisições concorrentes com a mesma key criam uma única cobrança', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post('key-4', body)),
    );
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(responses.every((res) => [200, 201].includes(res.status))).toBe(
      true,
    );
    expect(new Set(responses.map((res) => json(res).id)).size).toBe(1);
    const [{ count }]: { count: string }[] = await dataSource.query(
      'SELECT count(*) FROM charges',
    );
    expect(count).toBe('1');
  });

  it('GET retorna a cobrança, 404 se não existe e 400 se id inválido', async () => {
    const created = await post('key-5', body).expect(201);
    await request(app.getHttpServer())
      .get(`/charges/${json(created).id}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/charges/5f0e2b8a-9d3c-4f6e-8a1b-2c3d4e5f6a7b')
      .expect(404);
    await request(app.getHttpServer()).get('/charges/abc').expect(400);
  });
});

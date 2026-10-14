import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ChargeRequest } from './request-hash';

const received = ({ value }: { value: unknown }) =>
  `recebido: ${JSON.stringify(value)}`;

export class CreateChargeDto implements ChargeRequest {
  @IsInt({
    message: (args) =>
      `amount_cents deve ser inteiro em centavos; ${received(args)}`,
  })
  @Min(1, { message: (args) => `amount_cents deve ser > 0; ${received(args)}` })
  // Acima disso o JSON.parse já perdeu precisão: o valor gravado não seria o enviado
  @Max(Number.MAX_SAFE_INTEGER, {
    message: (args) =>
      `amount_cents deve ser <= ${Number.MAX_SAFE_INTEGER}; ${received(args)}`,
  })
  amount_cents!: number;

  @IsIn(['BRL'], {
    message: (args) => `currency deve ser "BRL"; ${received(args)}`,
  })
  currency!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customer_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;
}

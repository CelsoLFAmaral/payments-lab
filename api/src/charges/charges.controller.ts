import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChargeResponse, toChargeResponse } from './charge.response';
import { ChargesService } from './charges.service';
import { CreateChargeDto } from './create-charge.dto';

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

function requireIdempotencyKey(key: string | undefined): string {
  if (!key)
    throw new BadRequestException('Cabeçalho Idempotency-Key obrigatório');
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH)
    throw new BadRequestException(
      `Idempotency-Key deve ter no máximo ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres; recebido: ${key.length}`,
    );
  return key;
}

@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateChargeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChargeResponse> {
    const { charge, created } = await this.chargesService.create(
      requireIdempotencyKey(idempotencyKey),
      body,
    );
    res.status(created ? 201 : 200);
    return toChargeResponse(charge);
  }

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ChargeResponse> {
    const charge = await this.chargesService.findById(id);
    if (!charge) throw new NotFoundException(`Cobrança ${id} não encontrada`);
    return toChargeResponse(charge);
  }
}

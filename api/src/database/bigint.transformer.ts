import { ValueTransformer } from 'typeorm';

// O driver pg devolve bigint como string; DTO e constraint limitam amount_cents a Number.MAX_SAFE_INTEGER
export const bigintTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

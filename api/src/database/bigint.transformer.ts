import { ValueTransformer } from 'typeorm';

// O driver pg devolve bigint como string; centavos cabem com folga em Number.MAX_SAFE_INTEGER
export const bigintTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

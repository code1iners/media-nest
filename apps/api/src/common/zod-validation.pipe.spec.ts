import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  /** 테스트용 schema. */
  const schema = z.strictObject({
    /** 필수 이름. */
    name: z.string().min(1),
  });

  it('returns parsed input when it matches the schema', () => {
    /** 테스트 대상 pipe. */
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ name: 'sample' })).toEqual({ name: 'sample' });
  });

  it('throws bad request when input does not match the schema', () => {
    /** 테스트 대상 pipe. */
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });
});

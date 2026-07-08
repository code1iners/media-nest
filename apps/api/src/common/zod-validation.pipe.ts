import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Zod schema로 route 입력값을 검증하는 Nest pipe. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown) {
    /** route 입력값 검증 결과. */
    const result = this.schema.safeParse(value);

    if (!result.success) {
      /** 클라이언트가 바로 고칠 수 있는 첫 번째 검증 오류. */
      const message = result.error.issues[0]?.message ?? 'Validation failed';

      throw new BadRequestException(message);
    }

    return result.data;
  }
}

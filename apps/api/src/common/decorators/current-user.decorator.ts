import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@order-q/shared';

export interface CurrentUser {
  sub: string;
  outletId: string;
  name: string;
  role: UserRole;
  shiftId?: string;
  stationId?: string | null;
  stationIds?: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUser | undefined, ctx: ExecutionContext): CurrentUser | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
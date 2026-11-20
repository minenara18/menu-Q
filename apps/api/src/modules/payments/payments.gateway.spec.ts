import { PaymentsGateway } from './payments.gateway';

describe('PaymentsGateway (scheduler)', () => {
  it('schedules the expiry sweep from onModuleInit and clears it onModuleDestroy', () => {
    const config = {
      get: (key: string) => (key === 'app.qris.sweepIntervalMs' ? 60_000 : undefined),
    } as never;
    const gateway = new PaymentsGateway({} as never, {} as never, config);
    const sweep = jest
      .spyOn(gateway as unknown as { checkExpiredPayments: () => Promise<void> }, 'checkExpiredPayments')
      .mockResolvedValue(undefined);

    jest.useFakeTimers();
    gateway.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(60_000);
    expect(sweep).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_000);
    expect(sweep).toHaveBeenCalledTimes(2);

    gateway.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    sweep.mockRestore();
  });
});

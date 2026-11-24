import { assertNotProduction } from '../../prisma/seed';

describe('seed production guard', () => {
  const original = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('refuses to run in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertNotProduction()).toThrow(/production/);
  });

  it('allows running in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertNotProduction()).not.toThrow();
  });
});

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: [],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@order-q/shared$': '<rootDir>/../../packages/shared/src',
  },
  testTimeout: 90000,
  maxWorkers: 1,
};

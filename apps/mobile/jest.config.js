module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@order-q/shared$': '<rootDir>/../../packages/shared/src',
    '^react$': '<rootDir>/../../node_modules/react',
    '^react-native$': '<rootDir>/../../node_modules/react-native',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo[^/]*|@expo[^/]*|react-navigation|@react-navigation|react-native-reanimated|react-native-worklets)/)',
  ],
};

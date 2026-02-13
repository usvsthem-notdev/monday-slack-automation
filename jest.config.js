/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/setup.js'],
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.js',
    '<rootDir>/src/__tests__/**/*.e2e.test.js',
    '<rootDir>/src/__tests__/**/*.properties.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/__tests__/setup.js',
    '<rootDir>/src/__tests__/mocks/',
    '<rootDir>/src/__tests__/e2e/setup.js',
    '<rootDir>/src/__tests__/properties/generators.js',
    '<rootDir>/src/__tests__/automation.test.js',
    '<rootDir>/src/__tests__/utils/'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/automation.js',
    '!src/automation-optimized.js',
    '!src/__tests__/**',
    '!src/patches/**',
    '!src/app.js',
    '!src/unified-server.js',
    '!src/slackCommands.js',
    '!src/utils/validate-env.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true,
  testTimeout: 10000
};

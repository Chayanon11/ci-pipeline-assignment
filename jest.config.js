export default {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/?(*.)+(test).mjs"],
  collectCoverage: true,
  collectCoverageFrom: [
    "app.mjs",
    "db/**/*.mjs",
    "!**/node_modules/**",
    "!**/coverage/**"
  ],
  coverageDirectory: "coverage",
  coverageReporters: [
    "text",
    "lcov",
    "html",
    "json"
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
  testTimeout: 10000,
  setupFilesAfterEnv: [],
  moduleFileExtensions: ["mjs", "js", "json"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/coverage/"
  ]
};
/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/nodes'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	collectCoverageFrom: ['nodes/**/*.ts', '!nodes/**/*.test.ts'],
	coverageDirectory: 'coverage',
	verbose: true,
};

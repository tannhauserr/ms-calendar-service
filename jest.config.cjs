/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: ["**/integration/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    moduleFileExtensions: ["ts", "js", "json"],
};

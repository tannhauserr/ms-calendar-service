import dotenv from "dotenv";

const globalForEnvLoader = globalThis as {
    __msCalendarEnvLoaded?: boolean;
};

if (!globalForEnvLoader.__msCalendarEnvLoaded) {
    const runtimeNodeEnv = process.env.NODE_ENV ?? "development";

    dotenv.config({ path: `.env.${runtimeNodeEnv}` });
    dotenv.config();

    globalForEnvLoader.__msCalendarEnvLoaded = true;
}

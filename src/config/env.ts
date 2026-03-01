import dotenv from "dotenv";

dotenv.config();

const DEFAULT_BASE_URL = "https://api.getsong.co/";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  getSongBaseUrl: process.env.GETSONG_BASE_URL ?? DEFAULT_BASE_URL,
  getSongApiKey: requireEnv("GETSONG_API_KEY"),
};

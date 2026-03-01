import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { GetSongClient, UpstreamApiError } from "./getsongClient";
import { buildRecommendations } from "./recommendationService";
import { parseRecommendationInput, ValidationError } from "./validation";

const app = express();
const getSongClient = new GetSongClient();

app.get("/", (_req: Request, res: Response) => {
  // Resolve relative to runtime output (dist/) first, with src/ fallback for local dev.
  const distUiPath = path.resolve(__dirname, "ui/index.html");
  const srcUiPath = path.resolve(__dirname, "../src/ui/index.html");
  const uiPath = fs.existsSync(distUiPath) ? distUiPath : srcUiPath;
  res.sendFile(uiPath);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/recommendations", async (req: Request, res: Response) => {
  try {
    const input = parseRecommendationInput(req.query as Record<string, unknown>);
    const data = await buildRecommendations(input, getSongClient);
    res.json(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: "ValidationError",
        message: error.message,
      });
      return;
    }

    if (error instanceof UpstreamApiError) {
      res.status(502).json({
        error: "UpstreamApiError",
        message:
          "Failed to retrieve data from GetSong API. Please retry and verify GETSONG_API_KEY/base URL.",
        details: error.message,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({
      error: "InternalServerError",
      message,
    });
  }
});

app.listen(env.port, () => {
  console.log(`Camelot recommendations API listening on port ${env.port}`);
});

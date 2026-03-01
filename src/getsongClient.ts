import { env } from "./config/env";
import { GetSongKeyParams } from "./camelot";

export interface SongByKeyResult {
  id: string;
  raw: unknown;
}

export type SongDetail = Record<string, unknown>;
export interface SongDetailFetchResult {
  detail: SongDetail | null;
  skippedDueToUpstream: boolean;
}

function toUrl(pathname: string, query: Record<string, string | number>): URL {
  const url = new URL(pathname, env.getSongBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function toLoggableUrl(url: URL): string {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("api_key")) {
    safeUrl.searchParams.set("api_key", "***");
  }
  return safeUrl.toString();
}

function truncateForLog(value: string, maxLength = 1200): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(statusCode: number): boolean {
  return statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}

export class UpstreamApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function extractArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidateFields = ["results", "songs", "data", "response", "key_of"];
  for (const field of candidateFields) {
    const value = (payload as Record<string, unknown>)[field];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function extractSongId(record: unknown): string | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const obj = record as Record<string, unknown>;
  const candidates = [obj.id, obj.song_id, obj.songId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      return String(candidate);
    }
  }
  return null;
}

export class GetSongClient {
  private readonly songCache = new Map<string, SongDetail | null>();

  private async fetchJson(pathname: string, query: Record<string, string | number>): Promise<unknown> {
    const maxAttempts = 3;
    const baseBackoffMs = 250;

    // Send api_key in query because some GetSong endpoints enforce it there.
    const url = toUrl(pathname, { ...query, api_key: env.getSongApiKey });
    // console.log(`[GetSong] GET ${toLoggableUrl(url)}`);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            "X-API-KEY": env.getSongApiKey,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown fetch error";
        if (attempt < maxAttempts) {
          await sleep(baseBackoffMs * 2 ** (attempt - 1));
          continue;
        }
        throw new UpstreamApiError(`GetSong network error for ${pathname}: ${message}`, 502);
      }

      const responseText = await response.text();
      // console.log(
      //   `[GetSong] RESPONSE ${response.status} ${response.statusText} ${toLoggableUrl(url)} :: ${truncateForLog(responseText)}`,
      // );

      if (response.ok) {
        try {
          return JSON.parse(responseText);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid JSON";
          throw new UpstreamApiError(
            `GetSong returned invalid JSON for ${pathname}: ${message}`,
            response.status,
          );
        }
      }

      if (attempt < maxAttempts && shouldRetryStatus(response.status)) {
        await sleep(baseBackoffMs * 2 ** (attempt - 1));
        continue;
      }

      throw new UpstreamApiError(
        `GetSong request failed for ${pathname}: HTTP ${response.status}. Body: ${truncateForLog(responseText, 300)}`,
        response.status,
      );
    }

    throw new UpstreamApiError(`GetSong request failed for ${pathname}: retries exhausted`, 502);
  }

  async fetchSongsByKey(params: GetSongKeyParams, limit = 200): Promise<SongByKeyResult[]> {
    const payload = await this.fetchJson("/key/", {
      key_of: params.key_of,
      mode: params.mode,
      limit,
    });

    const rows = extractArrayPayload(payload);
    return rows
      .map((row) => {
        const id = extractSongId(row);
        if (!id) {
          return null;
        }
        return { id, raw: row };
      })
      .filter((row): row is SongByKeyResult => Boolean(row));
  }

  async fetchSongById(id: string): Promise<SongDetailFetchResult> {
    if (this.songCache.has(id)) {
      return { detail: this.songCache.get(id) ?? null, skippedDueToUpstream: false };
    }

    let payload: unknown;
    try {
      payload = await this.fetchJson("/song/", { id });
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode >= 500) {
        console.warn(`[GetSong] Skipping song ${id} due to upstream ${error.statusCode}`);
        this.songCache.set(id, null);
        return { detail: null, skippedDueToUpstream: true };
      }
      throw error;
    }
    let detail: SongDetail | null = null;

    if (Array.isArray(payload)) {
      const first = payload[0];
      if (first && typeof first === "object") {
        detail = first as SongDetail;
      }
    } else if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (obj.song && typeof obj.song === "object") {
        detail = obj.song as SongDetail;
      } else {
        detail = obj;
      }
    }

    this.songCache.set(id, detail);
    return { detail, skippedDueToUpstream: false };
  }
}

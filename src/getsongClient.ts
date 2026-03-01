import { env } from "./config/env";
import { GetSongKeyParams } from "./camelot";

export interface SongByKeyResult {
  id: string;
  raw: unknown;
}

export type SongDetail = Record<string, unknown>;

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

  const candidateFields = ["results", "songs", "data", "response"];
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
    // Send api_key in query because some GetSong endpoints enforce it there.
    const url = toUrl(pathname, { ...query, api_key: env.getSongApiKey });
    console.log(`[GetSong] GET ${toLoggableUrl(url)}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": env.getSongApiKey,
      },
    });

    if (!response.ok) {
      throw new UpstreamApiError(
        `GetSong request failed for ${pathname}: HTTP ${response.status}`,
        response.status,
      );
    }

    return response.json();
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

  async fetchSongById(id: string): Promise<SongDetail | null> {
    if (this.songCache.has(id)) {
      return this.songCache.get(id) ?? null;
    }

    const payload = await this.fetchJson("/song/", { id });
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
    return detail;
  }
}

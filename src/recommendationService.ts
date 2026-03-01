import { getCompatibleCamelotKeys, getGetSongParamsForCamelot } from "./camelot";
import { GetSongClient, SongDetail } from "./getsongClient";
import { RecommendationInput } from "./validation";

export interface RecommendedSong {
  id: string;
  title: string | null;
  artist: string | null;
  bpm: number | null;
  genres: string[];
  raw: SongDetail;
}

export interface RecommendationResponse {
  request: RecommendationInput;
  compatibleKeys: string[];
  totalUniqueCandidates: number;
  totalMatched: number;
  resultsByKey: Record<string, RecommendedSong[]>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function collectGenres(song: SongDetail): string[] {
  const genres = new Set<string>();
  const songObj = asObject(song);
  if (!songObj) {
    return [];
  }

  const genreSources: unknown[] = [
    songObj.genre,
    songObj.genres,
    songObj.style,
    songObj.styles,
  ];

  const artist = asObject(songObj.artist);
  if (artist) {
    genreSources.push(artist.genre, artist.genres, artist.style, artist.styles);
  }

  const artists = Array.isArray(songObj.artists) ? songObj.artists : [];
  for (const artistItem of artists) {
    const artistObj = asObject(artistItem);
    if (!artistObj) {
      continue;
    }
    genreSources.push(
      artistObj.genre,
      artistObj.genres,
      artistObj.style,
      artistObj.styles,
      artistObj.name,
    );
  }

  for (const source of genreSources) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const text = readString(item);
        if (text) {
          genres.add(text);
        }
      }
    } else {
      const text = readString(source);
      if (text) {
        genres.add(text);
      }
    }
  }

  return Array.from(genres);
}

function extractBpm(song: SongDetail): number | null {
  const songObj = asObject(song);
  if (!songObj) {
    return null;
  }

  const candidates = [
    songObj.bpm,
    songObj.tempo,
    songObj.song_bpm,
    asObject(songObj.audio_summary)?.tempo,
    asObject(songObj.audio)?.tempo,
  ];

  for (const value of candidates) {
    const bpm = readNumber(value);
    if (bpm !== null) {
      return bpm;
    }
  }
  return null;
}

function extractTitle(song: SongDetail): string | null {
  const songObj = asObject(song);
  if (!songObj) {
    return null;
  }
  return readString(songObj.title) ?? readString(songObj.song) ?? readString(songObj.name);
}

function extractArtist(song: SongDetail): string | null {
  const songObj = asObject(song);
  if (!songObj) {
    return null;
  }

  const artistObj = asObject(songObj.artist);
  if (artistObj) {
    const artistName = readString(artistObj.name) ?? readString(artistObj.artist);
    if (artistName) {
      return artistName;
    }
  }

  const artists = Array.isArray(songObj.artists) ? songObj.artists : [];
  const artistNames = artists
    .map((item) => {
      const artistItem = asObject(item);
      if (!artistItem) {
        return null;
      }
      return readString(artistItem.name) ?? readString(artistItem.artist);
    })
    .filter((name): name is string => Boolean(name));

  if (artistNames.length > 0) {
    return artistNames.join(", ");
  }

  return readString(songObj.artist_name);
}

function songMatchesGenre(song: SongDetail, requestedGenre: string): { matches: boolean; genres: string[] } {
  const genres = collectGenres(song);
  const wanted = requestedGenre.toLowerCase();
  const matches = genres.some((genre) => genre.toLowerCase().includes(wanted));
  return { matches, genres };
}

function toRecommendedSong(id: string, song: SongDetail, genres: string[]): RecommendedSong {
  return {
    id,
    title: extractTitle(song),
    artist: extractArtist(song),
    bpm: extractBpm(song),
    genres,
    raw: song,
  };
}

export async function buildRecommendations(
  input: RecommendationInput,
  client: GetSongClient,
): Promise<RecommendationResponse> {
  const compatibleKeys = getCompatibleCamelotKeys(input.camelotKey);

  const idsByKey = new Map<string, Set<string>>();
  const allSongIds = new Set<string>();

  await Promise.all(
    compatibleKeys.map(async (compatibleKey) => {
      const params = getGetSongParamsForCamelot(compatibleKey);
      const songs = await client.fetchSongsByKey(params, 200);
      const idSet = new Set<string>();
      for (const song of songs) {
        idSet.add(song.id);
        allSongIds.add(song.id);
      }
      idsByKey.set(compatibleKey, idSet);
    }),
  );

  const detailsById = new Map<string, SongDetail | null>();
  await Promise.all(
    Array.from(allSongIds).map(async (id) => {
      const detail = await client.fetchSongById(id);
      detailsById.set(id, detail);
    }),
  );

  const minBpm = input.bpm - input.bpmWindow;
  const maxBpm = input.bpm + input.bpmWindow;
  const resultsByKey: Record<string, RecommendedSong[]> = {};
  let totalMatched = 0;

  for (const key of compatibleKeys) {
    const ids = idsByKey.get(key) ?? new Set<string>();
    const list: RecommendedSong[] = [];
    for (const id of ids) {
      const detail = detailsById.get(id);
      if (!detail) {
        continue;
      }

      const songBpm = extractBpm(detail);
      if (songBpm === null || songBpm < minBpm || songBpm > maxBpm) {
        continue;
      }

      const genreCheck = songMatchesGenre(detail, input.genre);
      if (!genreCheck.matches) {
        continue;
      }

      list.push(toRecommendedSong(id, detail, genreCheck.genres));
    }
    totalMatched += list.length;
    resultsByKey[key] = list;
  }

  return {
    request: input,
    compatibleKeys,
    totalUniqueCandidates: allSongIds.size,
    totalMatched,
    resultsByKey,
  };
}

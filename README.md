# PlaylistCurator

TypeScript Node.js REST API for DJ harmonic-mixing recommendations using Camelot wheel compatibility and GetSong data.

## Requirements

- Node.js 18+ (for native `fetch`)
- A GetSong API key in `.env`:

```env
GETSONG_API_KEY=your_api_key_here
```

Optional:

```env
PORT=3000
GETSONG_BASE_URL=https://api.getsong.co/
```

## Install and Run

```bash
npm install
npm run dev
```

Build and run production:

```bash
npm run build
npm start
```

## API Endpoint

`GET /recommendations`

### Query params

- `camelotKey` (required): string in `1A..12A` or `1B..12B` format (example: `8A`)
- `bpm` (required): positive number
- `genre` (optional): defaults to `electronic`
- `bpmWindow` (optional): non-negative number, defaults to `3`

Example:

```http
GET /recommendations?camelotKey=8A&bpm=124&genre=electronic&bpmWindow=3
```

### How recommendations are computed

1. Compute compatible keys for input key `nA`/`nB`:
   - `n` same letter
   - `n-1` same letter (with `1 -> 12`)
   - `n+1` same letter (with `12 -> 1`)
   - `n` other letter
2. Map each compatible Camelot key to `{ key_of, mode }` and query:
   - `GET /key/?key_of=...&mode=...&limit=200`
3. Dedupe candidates globally by song id.
4. Fetch details with:
   - `GET /song/?id=...`
5. Filter songs by:
   - Tempo in `[bpm - bpmWindow, bpm + bpmWindow]`
   - Artist/song genre matching requested `genre` (case-insensitive substring)
6. Return results grouped by compatible Camelot key.

### Response shape

```json
{
  "request": {
    "camelotKey": "8A",
    "bpm": 124,
    "genre": "electronic",
    "bpmWindow": 3
  },
  "compatibleKeys": ["8A", "7A", "9A", "8B"],
  "totalUniqueCandidates": 0,
  "totalMatched": 0,
  "resultsByKey": {
    "8A": [],
    "7A": [],
    "9A": [],
    "8B": []
  }
}
```

## Notes

- Song detail lookups (`/song/`) are cached in memory by song id to reduce repeated API calls.
- Validation errors return `400` with a helpful message.
- Upstream GetSong failures return `502`.

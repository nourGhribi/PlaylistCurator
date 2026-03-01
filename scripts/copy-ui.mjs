import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "src/ui/index.html");
const targetPath = path.join(rootDir, "dist/ui/index.html");

await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.copyFile(sourcePath, targetPath);

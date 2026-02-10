import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join } from "path";
import type { ImageStorage } from "./types";

const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

export class LocalImageStorage implements ImageStorage {
  async upload(id: string, buffer: Buffer): Promise<string> {
    const filename = `${id}.png`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, filename), buffer);
    return `/uploads/${filename}`;
  }

  async get(id: string): Promise<Buffer | null> {
    const filename = `${id}.png`;
    try {
      return await readFile(join(UPLOADS_DIR, filename));
    } catch {
      return null;
    }
  }

  getUrl(id: string): string {
    return `/uploads/${id}.png`;
  }

  async delete(id: string): Promise<void> {
    const filename = `${id}.png`;
    try {
      await unlink(join(UPLOADS_DIR, filename));
    } catch {
    }
  }
}

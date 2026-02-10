export interface ImageStorage {
  upload(id: string, buffer: Buffer): Promise<string>;
  get(id: string): Promise<Buffer | null>;
  getUrl(id: string): string;
  delete(id: string): Promise<void>;
}

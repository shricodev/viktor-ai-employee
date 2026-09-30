import { Readable } from "node:stream";
import tar from "tar-stream";

export async function packFile(name: string, content: Buffer): Promise<Buffer> {
  const pack = tar.pack();
  pack.entry({ name, size: content.length, mode: 0o644, uid: 1000, gid: 1000 }, content);
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function unpackFirstFile(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  const extract = tar.extract();
  Readable.from(stream as AsyncIterable<Buffer>).pipe(extract);
  for await (const entry of extract) {
    if (entry.header.type !== "file") {
      entry.resume();
      continue;
    }
    if ((entry.header.size ?? 0) > maxBytes) {
      throw new Error(`file is ${entry.header.size} bytes, limit is ${maxBytes}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of entry) chunks.push(chunk as Buffer);
    extract.destroy();
    return Buffer.concat(chunks);
  }
  throw new Error("archive contained no regular file");
}

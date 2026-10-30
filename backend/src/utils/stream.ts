import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Context } from 'hono';

/**
 * Handles HTTP 206 Partial Content streaming and full-file streaming
 * with zero-memory footprint using Node.js ReadStreams.
 */
export async function streamFileWithRange(
  c: Context,
  filePath: string,
  mimeType: string
): Promise<Response> {
  const stat = await fsp.stat(filePath);
  const fileSize = stat.size;
  const rangeHeader = c.req.header('range');

  if (!rangeHeader) {
    // Normal 200 stream
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
  }

  // Parse Range header (e.g. "bytes=0-1024" or "bytes=1024-")
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
    return new Response('Requested Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${fileSize}`
      }
    });
  }

  const chunkSize = end - start + 1;
  const nodeStream = fs.createReadStream(filePath, { start, end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    }
  });
}

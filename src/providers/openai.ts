import { promises as fs } from 'node:fs';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import type { ImageFormat } from '../types.js';
import { retry } from '../lib/retry.js';

export interface OpenAIImageRequest {
  prompt: string;
  format: ImageFormat;
  refs: string[];
  anchor?: string;
  /** Optional inpaint mask PNG (transparent = editable, opaque = preserved). Must match the first ref's dimensions. */
  mask?: string;
  outputPath: string;
}

export interface OpenAIImageResult {
  path: string;
}

const MODEL = 'gpt-image-2';
const MAX_REFS = 16;

const SIZE_MAP: Record<ImageFormat, '1024x1024' | '1024x1536' | '1536x1024'> = {
  square: '1024x1024',
  story: '1024x1536',
  landscape: '1536x1024',
};

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function generateOpenAIImage(req: OpenAIImageRequest): Promise<OpenAIImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const client = new OpenAI({ apiKey });
  const size = SIZE_MAP[req.format];
  const allRefs = [...req.refs, ...(req.anchor ? [req.anchor] : [])].slice(0, MAX_REFS);

  const callImagesEdit = async (): Promise<{ b64_json?: string }> => {
    const files = await Promise.all(
      allRefs.map(async (r) => {
        const buf = await fs.readFile(r);
        return toFile(buf, path.basename(r), { type: inferMimeType(r) });
      }),
    );
    const maskFile = req.mask
      ? await toFile(await fs.readFile(req.mask), path.basename(req.mask), { type: 'image/png' })
      : undefined;
    const response = await client.images.edit({
      model: MODEL,
      prompt: req.prompt,
      image: files,
      size,
      quality: 'high',
      ...(maskFile ? { mask: maskFile } : {}),
    });
    return response.data?.[0] ?? {};
  };

  const callImagesGenerate = async (): Promise<{ b64_json?: string }> => {
    const response = await client.images.generate({
      model: MODEL,
      prompt: req.prompt,
      size,
      quality: 'high',
    });
    return response.data?.[0] ?? {};
  };

  const result = await retry(
    () => (allRefs.length > 0 ? callImagesEdit() : callImagesGenerate()),
    { attempts: 3, baseMs: 2000 },
  );

  if (!result.b64_json) {
    throw new Error('OpenAI returned no image data');
  }

  const buf = Buffer.from(result.b64_json, 'base64');
  const baseNoExt = req.outputPath.replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const finalPath = `${baseNoExt}.png`;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, buf);

  return { path: finalPath };
}

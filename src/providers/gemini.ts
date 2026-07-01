import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { AspectRatio, GeminiImageModel, ImageFormat, ImageSize } from '../types.js';
import { FORMAT_RATIO } from '../types.js';
import { retry } from '../lib/retry.js';

export interface GeminiRequest {
  prompt: string;
  format: ImageFormat;
  refs: string[];
  /** Anchor image path (scene 1 output) — sent as additional ref for consistency. */
  anchor?: string;
  outputPath: string;
  /** Output resolution. Default: '2K'. */
  imageSize?: ImageSize;
  /** Gemini image model. Default: 'gemini-3-pro-image-preview'. */
  model?: GeminiImageModel;
  /** Override aspect ratio. Falls back to FORMAT_RATIO[format] when unset. */
  aspectRatio?: AspectRatio;
}

export interface GeminiResult {
  path: string;
}

const DEFAULT_MODEL: GeminiImageModel = 'gemini-3-pro-image-preview';

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function loadAsInlineData(filePath: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
  const buf = await fs.readFile(filePath);
  return {
    inlineData: { data: buf.toString('base64'), mimeType: inferMimeType(filePath) },
  };
}

export async function generateGeminiImage(req: GeminiRequest): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const client = new GoogleGenAI({ apiKey });

  const refParts = await Promise.all([
    ...req.refs.map((r) => loadAsInlineData(r)),
    ...(req.anchor ? [loadAsInlineData(req.anchor)] : []),
  ]);

  const aspectRatio = req.aspectRatio ?? FORMAT_RATIO[req.format];
  const imageSize = req.imageSize ?? '2K';
  const model = req.model ?? DEFAULT_MODEL;

  // Only Gemini 3 Pro Image honors the imageSize knob; gemini-2.5-flash-image ignores/rejects it.
  const imageConfig: { aspectRatio: AspectRatio; imageSize?: ImageSize } = { aspectRatio };
  if (model === 'gemini-3-pro-image-preview') imageConfig.imageSize = imageSize;

  const response = await retry(
    () => client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: req.prompt }, ...refParts] }],
      config: { imageConfig },
    }),
    { attempts: 3, baseMs: 2000 },
  );

  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    const parts = cand.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, 'base64');
        const actualMime = part.inlineData.mimeType ?? 'image/png';
        const ext = actualMime === 'image/jpeg' ? '.jpg'
                  : actualMime === 'image/webp' ? '.webp'
                  : '.png';
        const baseNoExt = req.outputPath.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const finalPath = `${baseNoExt}${ext}`;
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.writeFile(finalPath, buf);
        return { path: finalPath };
      }
    }
  }

  throw new Error('Gemini returned no image data in response');
}

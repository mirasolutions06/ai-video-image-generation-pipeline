import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
}));

import { generateGeminiImage } from '../../src/providers/gemini.js';

beforeEach(() => {
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = 'fake-key';
});

describe('generateGeminiImage', () => {
  it('writes the image to the requested output path', async () => {
    const fakePngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    generateContent.mockResolvedValueOnce({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: fakePngBytes.toString('base64'), mimeType: 'image/png' } }],
        },
      }],
    });

    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-test-'));
    const outPath = path.join(tmp, 'scene-1.png');

    const result = await generateGeminiImage({
      prompt: 'a hero shot',
      format: 'square',
      refs: [],
      outputPath: outPath,
    });

    expect(result.path).toBe(outPath);
    const written = await fs.readFile(outPath);
    expect(written.equals(fakePngBytes)).toBe(true);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('saves with .jpg extension when response mime is image/jpeg', async () => {
    const fakeJpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    generateContent.mockResolvedValueOnce({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: fakeJpgBytes.toString('base64'), mimeType: 'image/jpeg' } }],
        },
      }],
    });

    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-jpg-'));
    const outPath = path.join(tmp, 'scene-1.png');  // ask for png

    const result = await generateGeminiImage({
      prompt: 'a hero shot',
      format: 'square',
      refs: [],
      outputPath: outPath,
    });

    expect(result.path).toBe(path.join(tmp, 'scene-1.jpg'));  // got jpg
    const written = await fs.readFile(result.path);
    expect(written.equals(fakeJpgBytes)).toBe(true);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('throws when the response has no inlineData', async () => {
    generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] });
    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-test-'));
    const outPath = path.join(tmp, 'scene-1.png');

    await expect(generateGeminiImage({
      prompt: 'a hero shot',
      format: 'square',
      refs: [],
      outputPath: outPath,
    })).rejects.toThrow(/no image/i);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('uses the flash model and omits imageSize when model is gemini-2.5-flash-image', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0x89]).toString('base64'), mimeType: 'image/png' } }] } }],
    });
    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-flash-'));
    await generateGeminiImage({
      prompt: 'x', format: 'square', refs: [], outputPath: path.join(tmp, 's.png'),
      model: 'gemini-2.5-flash-image', imageSize: '4K',
    });
    const call = generateContent.mock.calls[0]![0] as { model: string; config: { imageConfig: { imageSize?: string } } };
    expect(call.model).toBe('gemini-2.5-flash-image');
    expect(call.config.imageConfig.imageSize).toBeUndefined();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('uses the pro model and passes imageSize when model is gemini-3-pro-image-preview', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0x89]).toString('base64'), mimeType: 'image/png' } }] } }],
    });
    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-pro-'));
    await generateGeminiImage({
      prompt: 'x', format: 'square', refs: [], outputPath: path.join(tmp, 's.png'),
      model: 'gemini-3-pro-image-preview', imageSize: '4K',
    });
    const call = generateContent.mock.calls[0]![0] as { model: string; config: { imageConfig: { imageSize?: string } } };
    expect(call.model).toBe('gemini-3-pro-image-preview');
    expect(call.config.imageConfig.imageSize).toBe('4K');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('defaults to the pro model when none is specified', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0x89]).toString('base64'), mimeType: 'image/png' } }] } }],
    });
    const tmp = await fs.mkdtemp(path.join(tmpdir(), 'gemini-def-'));
    await generateGeminiImage({ prompt: 'x', format: 'square', refs: [], outputPath: path.join(tmp, 's.png') });
    const defCall = generateContent.mock.calls[0]![0] as { model: string };
    expect(defCall.model).toBe('gemini-3-pro-image-preview');
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

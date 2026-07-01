import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { runVideoMode } from '../../src/modes/video.js';
import type { VideoConfig } from '../../src/types.js';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(tmpdir(), 'v3-video-e2e-'));
  process.env.HF_API_KEY = 'fake-hf';
  process.env.HF_API_SECRET = 'fake-secret';
  fetchMock.mockReset();
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('runVideoMode', () => {
  it('generates 1 Seedance clip end-to-end (mocked)', async () => {
    const projectDir = path.join(workspace, 'projects', 'demo');
    const memoryRoot = path.join(workspace, 'memory');
    await fs.mkdir(projectDir, { recursive: true });
    const refImage = path.join(projectDir, 'ref.jpg');
    await fs.writeFile(refImage, 'fakeimage');

    const fakeMp4 = Buffer.from([0x00, 0x00, 0x00, 0x18]);

    // Real Higgsfield API flow (5 fetches per clip):
    //   1. POST /files/generate-upload-url    → { upload_url, public_url }
    //   2. PUT  upload_url (image bytes)      → 200 ok
    //   3. POST /v1/image2video/seedance      → { id }
    //   4. GET  /v1/job-sets/{id}             → { jobs: [{ status, results }] }
    //   5. GET  cdn url                       → mp4 bytes
    fetchMock
      .mockResolvedValueOnce({                                    // 1. presign
        ok: true,
        json: async () => ({ upload_url: 'https://cdn/upload-here', public_url: 'https://cdn/img.jpg' }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' })  // 2. PUT bytes
      .mockResolvedValueOnce({                                    // 3. submit
        ok: true,
        json: async () => ({ id: 'r1' }),
      })
      .mockResolvedValueOnce({                                    // 4. poll (completed)
        ok: true,
        json: async () => ({
          jobs: [{ status: 'completed', results: { raw: { url: 'https://cdn/clip.mp4' } } }],
        }),
      })
      .mockResolvedValueOnce({                                    // 5. download
        ok: true,
        arrayBuffer: async () => fakeMp4,
      });

    const config: VideoConfig = {
      mode: 'video',
      title: 'demo-video',
      brand: 'TestBrand',
      format: 'youtube-short',
      videoProvider: 'seedance',
      clips: [{ prompt: 'subtle drift', imageReference: refImage, duration: 5 }],
    };

    const result = await runVideoMode({ projectDir, memoryRoot, config, options: {} });

    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]!.path).toBeTruthy();
    expect((await fs.stat(result.scenes[0]!.path!)).size).toBeGreaterThan(0);
  });
});

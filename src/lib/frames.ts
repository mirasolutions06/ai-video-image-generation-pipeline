import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const execFileAsync = promisify(execFile);

export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    videoPath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (isNaN(seconds)) throw new Error(`Could not parse duration from ${videoPath}`);
  return seconds;
}

export async function extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-sseof', '-0.1',
    '-i', videoPath,
    '-vframes', '1',
    '-q:v', '2',
    outputPath,
  ]);
  return outputPath;
}

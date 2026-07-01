import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { discoverRefs, filterRefsForScene } from '../../src/lib/refs.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), 'v3-refs-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function touch(p: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, '');
}

describe('discoverRefs', () => {
  it('finds product, model, style, location refs by filename pattern', async () => {
    await touch(path.join(tmp, 'product.jpg'));
    await touch(path.join(tmp, 'product-2.jpg'));
    await touch(path.join(tmp, 'model.jpg'));
    await touch(path.join(tmp, 'style.jpg'));
    await touch(path.join(tmp, 'location.jpg'));
    await touch(path.join(tmp, 'config.json'));

    const refs = await discoverRefs(tmp);
    expect(refs.product).toHaveLength(2);
    expect(refs.model).toHaveLength(1);
    expect(refs.style).toHaveLength(1);
    expect(refs.location).toHaveLength(1);
  });

  it('returns empty arrays when no refs exist', async () => {
    const refs = await discoverRefs(tmp);
    expect(refs.product).toEqual([]);
    expect(refs.model).toEqual([]);
  });
});

describe('filterRefsForScene', () => {
  const refs = {
    product: ['/p/product.jpg'],
    model: ['/p/model.jpg'],
    style: ['/p/style.jpg'],
    location: ['/p/location.jpg'],
  };

  it('product-only scene gets product + style + location', () => {
    const result = filterRefsForScene(refs, { hasProduct: true });
    expect(result).toEqual(expect.arrayContaining(['/p/product.jpg', '/p/style.jpg', '/p/location.jpg']));
    expect(result).not.toContain('/p/model.jpg');
  });

  it('model + product scene gets all model + product + style', () => {
    const result = filterRefsForScene(refs, { hasModel: true, hasProduct: true });
    expect(result).toEqual(expect.arrayContaining([
      '/p/model.jpg', '/p/product.jpg', '/p/style.jpg',
    ]));
  });

  it('detail scene gets model + product (skin tone matters)', () => {
    const result = filterRefsForScene(refs, { isDetail: true, hasProduct: true });
    expect(result).toContain('/p/model.jpg');
    expect(result).toContain('/p/product.jpg');
  });

  it('environment scene gets style + location only', () => {
    const result = filterRefsForScene(refs, {});
    expect(result).toEqual(expect.arrayContaining(['/p/style.jpg', '/p/location.jpg']));
    expect(result).not.toContain('/p/product.jpg');
    expect(result).not.toContain('/p/model.jpg');
  });
});

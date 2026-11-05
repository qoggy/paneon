import assert from 'node:assert/strict';

export async function assertFileIcons(rows, expected) {
  const icons = rows.locator('img[aria-hidden="true"]');
  assert.equal(await icons.count(), expected, 'Each file row uses FileIcon.');
  const images = await icons.evaluateAll(async (elements) => {
    await Promise.all(elements.map((image) => image.decode()));
    return elements.map((image) => ({
      embedded: image.src.startsWith('data:image/svg+xml'),
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    }));
  });
  assert.ok(images.every((image) => image.embedded && image.width === 14 && image.height === 14));
}

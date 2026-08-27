import {
  inspectSidecarIconBase64,
  normalizeUploadedSidecarIcon,
  SIDECAR_ICON_MAX_BYTES,
  sidecarIconWebResourceName,
} from '@/lib/sidecar-icon';

function base64(bytes: number[]): string {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    value += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  return btoa(value);
}

function png(width: number, height: number, padding = 0): string {
  const bytes = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    ...new Array<number>(padding).fill(0),
  ];
  return base64(bytes);
}

function jpegWithMarkerPadding(width: number, height: number): string {
  return base64([
    0xff, 0xd8,
    0xff, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

describe('sidecar icon validation', () => {
  it('validates PNG metadata and creates a configuration-owned name', async () => {
    const content = await inspectSidecarIconBase64(png(256, 256));

    expect(content).toMatchObject({
      mimeType: 'image/png',
      width: 256,
      height: 256,
    });

    expect(content.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecarIconWebResourceName(
      '79e1c0da-db9f-f111-aaad-0022480b10ac',
      content,
    )).toBe(
      `maftagsc_/sidecars/79e1c0dadb9ff111aaad0022480b10ac/icon_${content.contentHash.slice(0, 16)}.png`,
    );
  });

  it('accepts JPEG marker padding permitted by the format', async () => {
    await expect(inspectSidecarIconBase64(jpegWithMarkerPadding(128, 128)))
      .resolves.toMatchObject({
        mimeType: 'image/jpeg',
        width: 128,
        height: 128,
      });
  });

  it('rejects unsupported, oversized, and over-dimension images', async () => {
    await expect(inspectSidecarIconBase64(base64([1, 2, 3])))
      .rejects.toThrow('valid PNG or JPEG');
    await expect(inspectSidecarIconBase64(png(513, 256)))
      .rejects.toThrow('512 by 512');
    await expect(inspectSidecarIconBase64(png(
      256,
      256,
      SIDECAR_ICON_MAX_BYTES,
    ))).rejects.toThrow('256 KB or smaller');
  });

  it('decodes uploads through a CSP-compatible data URL', async () => {
    const pngBase64 = png(128, 128);
    const bytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
    const file = {
      type: 'image/png',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    } as File;
    let imageSource = '';
    const OriginalImage = globalThis.Image;
    const createElement = vi.spyOn(document, 'createElement');

    class TestImage {
      onload?: () => void;
      onerror?: () => void;

      set src(value: string) {
        imageSource = value;
        queueMicrotask(() => this.onload?.());
      }
    }

    createElement.mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') {
        return document.createElement(tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback({
          arrayBuffer: async () => bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        } as Blob),
      } as unknown as HTMLCanvasElement;
    });
    globalThis.Image = TestImage as unknown as typeof Image;

    try {
      await expect(normalizeUploadedSidecarIcon(file)).resolves.toMatchObject({
        mimeType: 'image/png',
        width: 128,
        height: 128,
      });
      expect(imageSource).toBe(`data:image/png;base64,${pngBase64}`);
    } finally {
      globalThis.Image = OriginalImage;
      createElement.mockRestore();
    }
  });
});

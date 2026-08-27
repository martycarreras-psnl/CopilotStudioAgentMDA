import type {
  SidecarIconContent,
  SidecarIconMimeType,
} from '@/types/sidecar-admin-models';

export const SIDECAR_ICON_MAX_BYTES = 256 * 1024;
export const SIDECAR_ICON_MAX_DIMENSION = 512;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    const marker = bytes[markerOffset];
    if (marker === 0x00) {
      offset = markerOffset + 1;
      continue;
    }
    if (
      marker === 0xd8
      || marker === 0xd9
      || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset = markerOffset + 1;
      continue;
    }
    const lengthOffset = markerOffset + 1;
    if (lengthOffset + 1 >= bytes.length) return undefined;
    const length = (bytes[lengthOffset] << 8) | bytes[lengthOffset + 1];
    if (length < 2 || lengthOffset + length > bytes.length) return undefined;
    if (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: (bytes[lengthOffset + 3] << 8) | bytes[lengthOffset + 4],
        width: (bytes[lengthOffset + 5] << 8) | bytes[lengthOffset + 6],
      };
    }
    offset = lengthOffset + length;
  }
  return undefined;
}

function inspectBytes(bytes: Uint8Array): {
  mimeType: SidecarIconMimeType;
  width: number;
  height: number;
} {
  const png = pngDimensions(bytes);
  if (png) return { mimeType: 'image/png', ...png };
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { mimeType: 'image/jpeg', ...jpeg };
  throw new Error('Choose a valid PNG or JPEG image.');
}

function validateDimensions(width: number, height: number): void {
  if (!width || !height) throw new Error('The image dimensions could not be read.');
  if (width > SIDECAR_ICON_MAX_DIMENSION || height > SIDECAR_ICON_MAX_DIMENSION) {
    throw new Error(`The image must be ${SIDECAR_ICON_MAX_DIMENSION} by ${SIDECAR_ICON_MAX_DIMENSION} pixels or smaller.`);
  }
}

async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function inspectSidecarIconBase64(
  value: string,
): Promise<SidecarIconContent> {
  const base64 = value.trim().replace(/^data:image\/(?:png|jpeg);base64,/i, '');
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    throw new Error('The image content is not valid base64.');
  }
  if (bytes.byteLength > SIDECAR_ICON_MAX_BYTES) {
    throw new Error('The image must be 256 KB or smaller.');
  }
  const inspected = inspectBytes(bytes);
  validateDimensions(inspected.width, inspected.height);
  return {
    base64,
    mimeType: inspected.mimeType,
    width: inspected.width,
    height: inspected.height,
    contentHash: await contentHash(bytes),
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = dataUrl;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: SidecarIconMimeType,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The image could not be normalized.')),
      mimeType,
      mimeType === 'image/jpeg' ? 0.9 : undefined,
    );
  });
}

export async function normalizeUploadedSidecarIcon(
  file: File,
): Promise<SidecarIconContent> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Upload a PNG or JPEG image.');
  }
  if (file.size > SIDECAR_ICON_MAX_BYTES) {
    throw new Error('The image must be 256 KB or smaller.');
  }
  const original = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectBytes(original);
  if (inspected.mimeType !== file.type) {
    throw new Error('The file extension and image content do not match.');
  }
  validateDimensions(inspected.width, inspected.height);

  const image = await loadImage(
    `data:${inspected.mimeType};base64,${bytesToBase64(original)}`,
  );
  const canvas = document.createElement('canvas');
  canvas.width = inspected.width;
  canvas.height = inspected.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not prepare the image.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const normalized = new Uint8Array(await (await canvasBlob(canvas, inspected.mimeType)).arrayBuffer());
  if (normalized.byteLength > SIDECAR_ICON_MAX_BYTES) {
    throw new Error('The normalized image must be 256 KB or smaller.');
  }
  return inspectSidecarIconBase64(bytesToBase64(normalized));
}

export function sidecarIconDataUrl(content: SidecarIconContent): string {
  return `data:${content.mimeType};base64,${content.base64}`;
}

export function sidecarIconWebResourceName(
  configurationId: string,
  content: SidecarIconContent,
): string {
  const configurationKey = configurationId.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (configurationKey.length !== 32) throw new Error('Configuration ID must be a valid GUID.');
  const extension = content.mimeType === 'image/png' ? 'png' : 'jpg';
  return `maftagsc_/sidecars/${configurationKey}/icon_${content.contentHash.slice(0, 16)}.${extension}`;
}

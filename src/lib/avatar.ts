/** Output size of profile avatars (px). Mirrors the Rust-side expectations. */
export const AVATAR_SIZE = 256;

export interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

/** Largest centered square inside a width×height image. Pure. */
export function centeredSquareCrop(width: number, height: number): CropRect {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

/**
 * Read an image file, center-crop it to a square and resize to
 * AVATAR_SIZE×AVATAR_SIZE, returning a PNG data-URL ready for
 * the `set_profile_avatar` command.
 */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { sx, sy, size } = centeredSquareCrop(
        img.naturalWidth,
        img.naturalHeight
      );
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file"));
    };
    img.src = url;
  });
}

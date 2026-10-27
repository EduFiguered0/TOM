const SIZE = 128;

/**
 * Recorta o centro em quadrado e reduz para 128×128 no próprio celular: só ~10 KB vão para o servidor.
 * WebP quando o navegador suporta; senão JPEG.
 */
export const shrinkPhoto = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador não consegue preparar a foto.');
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.8);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.8);
};

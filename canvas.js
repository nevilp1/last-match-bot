import { createCanvas, loadImage } from 'canvas';

export async function generateItemRow(itemImages) {
    const size = 62; // item icon size
    const gap = 6;

    const canvas = createCanvas(
        itemImages.length * (size + gap),
        size
    );

    const ctx = canvas.getContext('2d');

    for (let i = 0; i < itemImages.length; i++) {
        const img = await loadImage(itemImages[i]);
        ctx.drawImage(img, i * (size + gap), 0, size, size);
    }

    return canvas.toBuffer();
}
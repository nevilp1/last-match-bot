import { createCanvas, loadImage } from 'canvas';
import https from 'node:https';

function fetchImageBuffer(url) {
    if (!url) return Promise.resolve(null);
    
    return new Promise((resolve) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.dota2.com/',
                'Connection': 'close'
            },
            timeout: 10000
        }, (res) => {
            if (res.statusCode !== 200) return resolve(null);
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', () => resolve(null));
    });
}

export async function generateItemRow(itemImages) {
    if (!itemImages || itemImages.length === 0) return null;

    const width = 66;
    const height = 48;
    const gap = 6;

    const canvas = createCanvas(itemImages.length * (width + gap), height);
    const ctx = canvas.getContext('2d');

    const buffers = await Promise.all(itemImages.map(url => fetchImageBuffer(url)));

    for (let i = 0; i < buffers.length; i++) {
        const x = i * (width + gap);

        if (buffers[i]) {
            try {
                const img = await loadImage(buffers[i]);
                ctx.drawImage(img, x, 0, width, height);
                continue; // Successfully drawn!
            } catch (err) {
                console.error(`Error drawing image ${i}:`, err.message);
            }
        }

        // --- FALLBACK DRAWING (If buffer is null or fails) ---
        // 1. Fill background (dark grey empty slot)
        ctx.fillStyle = '#1c242d';
        ctx.fillRect(x, 0, width, height);

        // 2. Add border
        ctx.strokeStyle = '#323c48';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, 0, width, height);

        // 3. Optional: Draw a question mark or text
        ctx.fillStyle = '#6c7a89';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + width / 2, height / 2);
    }

    return canvas.toBuffer();
}
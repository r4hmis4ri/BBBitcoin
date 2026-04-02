const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');

const X_PATH = '/Users/imsograteful/BBBitcoin/X_pins/x-scheduling-adobe.csv';
const S_PATH = '/Users/imsograteful/BBBitcoin/X_pins/instagram_carousel_splits.csv';
const O_DIR = '/Users/imsograteful/BBBitcoin/instagram_carousel/output';
const CURRENT_CSV = '/Users/imsograteful/BBBitcoin/bluesky_automation/bluesky_carousel_schedule.csv';

// 1. Load Data
const xRecs = parse(fs.readFileSync(X_PATH, 'utf8'), { columns: true });
const sMap = new Map(parse(fs.readFileSync(S_PATH, 'utf8'), { columns: true }).map(r => [r.pin, r]));

// 2. Load existing CSV to preserve manual edits for 003, 004, 005
const currentContent = fs.readFileSync(CURRENT_CSV, 'utf8');
const currentLines = currentContent.split('\n').filter(l => l.trim() !== '');
const header = currentLines[0];
const existingPins = new Set(['003', '004', '005']);

const clean = t => `"${(t || '').replace(/"/g, '""')}"`;

const getImagePath = (p, s) => {
    const slideNum = s.toString().padStart(2, '0');
    return path.join(O_DIR, `pin_${p}`, `pin${p}_slide${slideNum}.jpg`);
};

const outputLines = [...currentLines];

// 3. Generate the rest (starting from 006)
let count = 4; // We already have 1, 2, 3
for (const x of xRecs) {
    const p = x.pin;
    if (existingPins.has(p)) continue;
    
    const s = sMap.get(p);
    if (!s) continue;

    const row = [count, p, x.Publish_date];
    
    // Main Post Text (Ensure < 300 chars if possible, or use snippet)
    let mainPostText = x.Threads_engage_text || x.Description || "";
    if (mainPostText.length > 290) {
        mainPostText = mainPostText.substring(0, 287) + "...";
    }
    row.push(clean(mainPostText));

    // Post 1 Images (2-5)
    for (let i = 2; i <= 5; i++) {
        row.push(getImagePath(p, i));
        row.push(clean(s[`slide_${i.toString().padStart(2, '0')}`]));
    }

    // Reply 1 (6-9)
    row.push(clean('🧵 Continued (2/3)...'));
    for (let i = 6; i <= 9; i++) {
        row.push(getImagePath(p, i));
        row.push(clean(s[`slide_${i.toString().padStart(2, '0')}`]));
    }

    // Reply 2 (10)
    row.push(clean('🚀 Final (3/3). Get the books at bit-by-bitcoin.com'));
    row.push(getImagePath(p, 10));
    row.push(clean(s.slide_10));

    outputLines.push(row.join(','));
    count++;
}

fs.writeFileSync(CURRENT_CSV, outputLines.join('\n'));
console.log(`✅ Successfully populated ${count - 1} pins in bluesky_carousel_schedule.csv`);

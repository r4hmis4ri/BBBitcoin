const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');

const X_PATH = '/Users/imsograteful/BBBitcoin/X_pins/x-scheduling-adobe.csv';
const S_PATH = '/Users/imsograteful/BBBitcoin/X_pins/instagram_carousel_splits.csv';
const O_DIR = '/Users/imsograteful/BBBitcoin/instagram_carousel/output';

const xRecs = parse(fs.readFileSync(X_PATH, 'utf8'), { columns: true });
const sMap = new Map(parse(fs.readFileSync(S_PATH, 'utf8'), { columns: true }).map(r => [r.pin, r]));
const clean = t => `"${(t || '').replace(/"/g, '""')}"`;

const rows = ['pin,Publish_date,Threads_engage_text,Main_Img_1,Main_Alt_1,Main_Img_2,Main_Alt_2,Main_Img_3,Main_Alt_3,Main_Img_4,Main_Alt_4,Reply_1_Text,R1_Img_1,R1_Alt_1,R1_Img_2,R1_Alt_2,R1_Img_3,R1_Alt_3,R1_Img_4,R1_Alt_4,Reply_2_Text,R2_Img_1,R2_Alt_1'];

for (const x of xRecs) {
    const p = x.pin;
    const s = sMap.get(p);
    if (!s) continue;
    
    const r = [p, x.Publish_date, clean(x.Threads_engage_text || x.Description)];
    
    // Main Post (Slides 2-5)
    for (let i = 2; i <= 5; i++) {
        const slideNum = i.toString().padStart(2, '0');
        r.push(path.join(O_DIR, `pin_${p}`, `pin${p}_slide${slideNum}.jpg`));
        r.push(clean(s[`slide_${slideNum}`]));
    }

    // Reply 1 (Slides 6-9)
    r.push(clean('🧵 Continued (2/3)...'));
    for (let i = 6; i <= 9; i++) {
        const slideNum = i.toString().padStart(2, '0');
        r.push(path.join(O_DIR, `pin_${p}`, `pin${p}_slide${slideNum}.jpg`));
        r.push(clean(s[`slide_${slideNum}`]));
    }

    // Reply 2 (Slide 10)
    r.push(clean('🚀 Final (3/3). Get the books at bit-by-bitcoin.com'));
    r.push(path.join(O_DIR, `pin_${p}`, `pin${p}_slide10.jpg`));
    r.push(clean(s.slide_10));
    
    rows.push(r.join(','));
}

fs.writeFileSync('/Users/imsograteful/BBBitcoin/bluesky_automation/bluesky_carousel_schedule.csv', rows.join('\n'));
console.log('✅ CSV Generated: bluesky_carousel_schedule.csv');

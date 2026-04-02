const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');

// Pointing to local copies to avoid macOS EPERM issues
const X_PATH = path.join(__dirname, 'pins_with_X_and_Threads_engage_2.csv');
const S_PATH = path.join(__dirname, 'instagram_carousel_splits.csv');

// Use relative path for GitHub Actions compatibility (images are reached via ../ from scheduler.js)
const O_DIR = '../instagram_carousel/output';
const TARGET = path.join(__dirname, 'bluesky_carousel_schedule.csv');

// Book URL Mapping System
const BOOK_URLS = {
    'Whitepaper for Humans': 'https://bit-by-bitcoin.com/the-bitcoin-whitepaper-for-humans/',
    'Don\'t Speak Nerd': 'https://bit-by-bitcoin.com/bitcoin-whitepaper-the-version-for-people-who-dont-speak-nerd/',
    'Woman': 'https://bit-by-bitcoin.com/bitcoin-a-womans-best-friend/',
    'Question Everything': 'https://bit-by-bitcoin.com/question-everything-you-know-about-money/',
    'Myths': 'https://bit-by-bitcoin.com/bitcoin-myths-legends-debunked/',
    'Flush': 'https://bit-by-bitcoin.com/flush-the-fiat-a-down-the-drain-tour-of-historys-worst-currencies/',
    'Satoshi': 'https://bit-by-bitcoin.com/who-is-satoshi-nakamoto-the-hunt-for-bitcoins-disappeared-creator/',
    'Saylor': 'https://bit-by-bitcoin.com/the-saylor-standard-why-bitcoin-is-perfect-money/',
    'Explained': 'https://bit-by-bitcoin.com/bitcoin-explained-without-the-brain-melt/',
    'Family Guide': 'https://bit-by-bitcoin.com/the-bitcoin-family-guide/',
    'Jokes': 'https://bit-by-bitcoin.com/bitcoin-jokes-the-funniest-financial-revolution/'
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Prevents the same book URL from appearing twice in a row
function decluster(array) {
    for (let i = 1; i < array.length - 1; i++) {
        // If this pin has the same book as the previous one
        if (array[i].bookUrl === array[i - 1].bookUrl) {
            // Find the next pin that has a DIFFERENT book and swap it
            for (let j = i + 1; j < array.length; j++) {
                if (array[j].bookUrl !== array[i - 1].bookUrl) {
                    [array[i], array[j]] = [array[j], array[i]];
                    break;
                }
            }
        }
    }
}

function getBookUrl(slide10Text) {
    for (const [key, url] of Object.entries(BOOK_URLS)) {
        if (slide10Text.includes(key)) return url;
    }
    return 'https://bit-by-bitcoin.com/the-bitcoin-book-gallery/'; // Fallback
}

function splitText(text, limit = 290) {
    if (text.length <= limit) return { main: text, extra: "" };
    
    // Attempt to split at a logical break point
    let splitIdx = text.lastIndexOf('\n', limit);
    if (splitIdx === -1 || splitIdx < limit * 0.5) splitIdx = text.lastIndexOf('. ', limit);
    if (splitIdx === -1 || splitIdx < limit * 0.5) splitIdx = text.lastIndexOf(' ', limit);
    if (splitIdx === -1) splitIdx = limit;

    return {
        main: text.substring(0, splitIdx).trim(),
        extra: text.substring(splitIdx).trim()
    };
}

function generate() {
    console.log('🎲 Generating Randomized & De-clustered Campaign from local CSV copies...');
    
    // 1. Load data
    if (!fs.existsSync(S_PATH) || !fs.existsSync(X_PATH)) {
        console.error('❌ Local CSV copies missing. Run the cp commands first.');
        return;
    }

    const splitsStr = fs.readFileSync(S_PATH, 'utf8');
    const splitsData = parse(splitsStr, { columns: true });
    const sMap = new Map(splitsData.map(s => [s.pin, s]));
    
    const scheduleStr = fs.readFileSync(X_PATH, 'utf8');
    const schedule = parse(scheduleStr, { columns: true });

    // Filter valid pins and attach metadata
    const validPairs = schedule
        .filter(x => sMap.has(x.pin))
        .map(x => {
            const s = sMap.get(x.pin);
            const bookUrl = getBookUrl(s.slide_10 || "");
            
            // Intelligent text recovery (detecting truncation in source)
            // Priority: X_engage_text (as per user request) -> Threads_engage_text -> Image_Body + Description
            let fullText = x.X_engage_text || x.Threads_engage_text || x.Image_Body || x.Description || "";
            
            if (fullText.endsWith('...') || fullText.length < 50) {
                // If the primary source is truncated, try Threads_engage_text if it's longer
                if (x.Threads_engage_text && !x.Threads_engage_text.endsWith('...') && x.Threads_engage_text.length > fullText.length) {
                    fullText = x.Threads_engage_text;
                }
                
                // Still possibly truncated? Pull from Image_Body + Description (the raw source)
                if (fullText.endsWith('...')) {
                    const body = x.Image_Body && !x.Image_Body.endsWith('...') ? x.Image_Body : "";
                    const desc = x.Description && !x.Description.endsWith('...') ? x.Description : "";
                    if (body || desc) {
                        fullText = `${body}\n\n${desc}`.trim();
                    }
                }
            }

            return { x, s, bookUrl, fullText };
        });

    const dates = schedule.map(x => x.Publish_date).sort();

    // 2. Shuffle and De-cluster
    shuffleArray(validPairs);
    decluster(validPairs);

    const header = 'no,pin,Publish_date,Threads_engage_text,Main_Img_1,Main_Alt_1,Main_Img_2,Main_Alt_2,Main_Img_3,Main_Alt_3,Main_Img_4,Main_Alt_4,Reply_1_Text,R1_Img_1,R1_Alt_1,R1_Img_2,R1_Alt_2,R1_Img_3,R1_Alt_3,R1_Img_4,R1_Alt_4,Reply_2_Text,R2_Img_1,R2_Alt_1';
    
    const rows = [header];
    const clean = t => `"${(t || '').replace(/"/g, '""').trim()}"`;

    validPairs.forEach((pair, index) => {
        const pin = pair.x.pin;
        const s = pair.s;
        const publishDate = dates[index];
        
        // Handle Content Splitting across Post and Reply 1
        const textParts = splitText(pair.fullText, 290);
        
        const r = [index + 1, pin, publishDate];
        r.push(clean(textParts.main)); // Main Post Body

        // Part 1: Main Post (Slides 2-5)
        for (let i = 2; i <= 5; i++) {
            const slideNum = i.toString().padStart(2, '0');
            // Path relative to repo root (used by scheduler in CAROUSEL mode)
            const relativePath = path.posix.join(O_DIR, `pin_${pin}`, `pin${pin}_slide${slideNum}.jpg`);
            r.push(relativePath);
            r.push(clean(s[`slide_${slideNum}`]));
        }

        // Part 2: Reply 1 (Slides 6-9)
        let r1Text = textParts.extra 
            ? `${textParts.extra}\n\n🧵 Continued (2/3)...` 
            : '🧵 Continued (2/3)...';
        
        // Safety cap for Bluesky
        if (r1Text.length > 300) r1Text = r1Text.substring(0, 297) + "...";
        
        r.push(clean(r1Text));
        for (let i = 6; i <= 9; i++) {
            const slideNum = i.toString().padStart(2, '0');
            const relativePath = path.posix.join(O_DIR, `pin_${pin}`, `pin${pin}_slide${slideNum}.jpg`);
            r.push(relativePath);
            r.push(clean(s[`slide_${slideNum}`]));
        }

        // Part 3: Reply 2 (Slide 10 + CTA)
        const slide10Desc = s.slide_10 || "Get it here";
        const finalCta = `🚀 Final (3/3). Get the full book here → ${pair.bookUrl}`;
        
        r.push(clean(finalCta));
        const relativePath10 = path.posix.join(O_DIR, `pin_${pin}`, `pin${pin}_slide10.jpg`);
        r.push(relativePath10);
        r.push(clean(slide10Desc));

        rows.push(r.join(','));
    });

    fs.writeFileSync(TARGET, rows.join('\n'));
    console.log(`✅ Success! Generated ${validPairs.length} pins with relative paths for GitHub compatibility.`);
}

try { generate(); } catch (e) {
    console.error('❌ Failed:', e.message);
}



require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const BlueskyBot = require('./post_to_bluesky');

// Configuration
const SCHEDULE_FILE = process.argv[2] || 'bluesky_carousel_schedule.csv';
const LOG_FILE = 'posted_log.json';

// Initialize Bot
const bot = new BlueskyBot();

function loadPostedLog() {
    if (fs.existsSync(LOG_FILE)) {
        return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    return {};
}

function savePostedLog(log) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

async function checkAndPost() {
    console.log(`🕒 Checking carousel schedule in ${SCHEDULE_FILE}...`);
    
    if (!fs.existsSync(SCHEDULE_FILE)) {
        console.error(`❌ Error: File not found: ${SCHEDULE_FILE}`);
        return;
    }

    const fileContent = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    const postedLog = loadPostedLog();
    const now = new Date();
    let changeMade = false;

    // Login once
    await bot.login();

    for (const record of records) {
        const id = record.pin || record.ID;
        if (postedLog[id]) continue;

        const dateStr = record.Publish_date;
        if (!dateStr) continue;

        const publishDate = new Date(dateStr);
        
        if (publishDate <= now) {
            console.log(`🚀 STARTING CAROUSEL THREAD: [${id}] - Scheduled for ${dateStr}`);
            
            try {
                // PART 1: Main Post (Slides 2-5)
                const mainText = record.Threads_engage_text || record.Description || record.Content;
                const mainImages = [];
                for (let i = 1; i <= 4; i++) {
                    const imgPath = record[`Main_Img_${i}`];
                    const imgAlt = record[`Main_Alt_${i}`];
                    if (imgPath && fs.existsSync(imgPath)) {
                        mainImages.push({ path: imgPath, alt: imgAlt });
                    }
                }

                const mainPost = await bot.postWithImages(mainText, mainImages);
                console.log(`✅ Main Post Successful!`);

                // PART 2: Reply 1 (Slides 6-9) - 29 sec delay
                if (record.Reply_1_Text || record.R1_Img_1) {
                    console.log(`⏳ Waiting 29 seconds for Reply 1...`);
                    await new Promise(r => setTimeout(r, 29000));
                    
                    const r1Text = record.Reply_1_Text || "";
                    const r1Images = [];
                    for (let i = 1; i <= 4; i++) {
                        const imgPath = record[`R1_Img_${i}`];
                        const imgAlt = record[`R1_Alt_${i}`];
                        if (imgPath && fs.existsSync(imgPath)) {
                            r1Images.push({ path: imgPath, alt: imgAlt });
                        }
                    }
                    
                    const reply1 = await bot.postWithImages(r1Text, r1Images, { root: mainPost, parent: mainPost });
                    console.log(`✅ Reply 1 Successful!`);

                    // PART 3: Reply 2 (Slide 10) - 28 sec delay
                    if (record.Reply_2_Text || record.R2_Img_1) {
                        console.log(`⏳ Waiting 28 seconds for Reply 2...`);
                        await new Promise(r => setTimeout(r, 28000));
                        
                        const r2Text = record.Reply_2_Text || "";
                        const r2Images = [];
                        if (record.R2_Img_1 && fs.existsSync(record.R2_Img_1)) {
                            r2Images.push({ path: record.R2_Img_1, alt: record.R2_Alt_1 });
                        }
                        
                        await bot.postWithImages(r2Text, r2Images, { root: mainPost, parent: reply1 });
                        console.log(`✅ Reply 2 Successful! Thread Complete.`);
                    }
                }

                // Log success
                postedLog[id] = {
                    uri: mainPost.uri,
                    date: new Date().toISOString()
                };
                changeMade = true;
                
            } catch (err) {
                console.error(`❌ Failed to post carousel ${id}:`, err.message);
            }
        }
    }

    if (changeMade) {
        savePostedLog(postedLog);
    } else {
        console.log('😴 No posts due at this time.');
    }
}

async function main() {
    try {
        await checkAndPost();
    } catch (err) {
        console.error('System Error:', err);
    }
    
    if (process.argv.includes('--loop')) {
        console.log(`🔄 Polling every 5 minutes...`);
        setInterval(async () => {
            await checkAndPost();
        }, 5 * 60 * 1000);
    }
}

main();

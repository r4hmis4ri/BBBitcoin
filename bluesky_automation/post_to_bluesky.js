require('dotenv').config({ path: '../.env' });
const { BskyAgent, RichText } = require('@atproto/api');
const fs = require('fs');
const path = require('path');

/**
 * Bluesky Automation Tool for BBBitcoin
 * Documentation: https://atproto.com/
 */

class BlueskyBot {
    constructor() {
        this.agent = new BskyAgent({
            service: 'https://bsky.social'
        });
    }

    /**
     * Authenticate with the handle and app password in .env
     */
    async login() {
        const handle = process.env.BSKY_HANDLE;
        const password = process.env.BSKY_APP_PASSWORD;

        if (!handle || !password) {
            throw new Error('BSKY_HANDLE or BSKY_APP_PASSWORD missing in .env');
        }

        console.log(`🔑 Logging into Bluesky as ${handle}...`);
        await this.agent.login({
            identifier: handle,
            password: password
        });
        console.log('✅ Success! Logged in.');
    }

    /**
     * Post text to Bluesky, automatically parsing links/mentions (facets)
     * @param {string} text - The post content
     */
    async post(text) {
        const rt = new RichText({ text });
        
        // This detects links and mentions in your text automatically
        await rt.detectFacets(this.agent);

        console.log('📤 Posting to Bluesky...');
        const response = await this.agent.post({
            text: rt.text,
            facets: rt.facets,
            createdAt: new Date().toISOString()
        });

        console.log(`✅ Post successful! URI: ${response.uri}`);
        return { uri: response.uri, cid: response.cid };
    }

    /**
     * Post with a single image
     * @param {string} text - Post caption
     * @param {string} imagePath - Absolute path to the image
     * @param {string} altText - Alt text for accessibility
     */
    async postWithImage(text, imagePath, altText = '') {
        const rt = new RichText({ text });
        await rt.detectFacets(this.agent);

        console.log(`🖼 Reading image: ${path.basename(imagePath)}...`);
        const imageBuffer = fs.readFileSync(imagePath);
        
        // Infer mime type from extension
        const ext = path.extname(imagePath).toLowerCase();
        let encoding = 'image/jpeg';
        if (ext === '.png') encoding = 'image/png';
        if (ext === '.gif') encoding = 'image/gif';

        console.log('📤 Uploading image to Bluesky blobs...');
        const { data: blobResponse } = await this.agent.uploadBlob(imageBuffer, { encoding });

        console.log('📤 Creating post with image...');
        const response = await this.agent.post({
            text: rt.text,
            facets: rt.facets,
            embed: {
                $type: 'app.bsky.embed.images',
                images: [
                    {
                        image: blobResponse.blob,
                        alt: altText || text.substring(0, 50) + '...'
                    }
                ]
            },
            createdAt: new Date().toISOString()
        });

        console.log(`✅ Success! URI: ${response.uri}`);
        return { uri: response.uri, cid: response.cid };
    }

    /**
     * Post a reply to an existing post
     * @param {string} text - Reply text
     * @param {object} parent - { uri, cid } of the parent post
     * @param {object} root - { uri, cid } of the thread root
     */
    /**
     * Post a single post with multiple images (up to 4)
     * @param {string} text - The post text
     * @param {Array} images - Array of { path, alt }
     * @param {object} reply - (Optional) { root, parent }
     */
    async postWithImages(text, images, reply = null) {
        const rt = new RichText({ text });
        await rt.detectFacets(this.agent);

        const embeds = [];
        for (const img of images) {
            if (!fs.existsSync(img.path)) {
                console.warn(`⚠️ Image not found: ${img.path}`);
                continue;
            }
            const fileData = fs.readFileSync(img.path);
            const blobResponse = await this.agent.uploadBlob(fileData, { encoding: 'image/jpeg' });
            embeds.push({
                image: blobResponse.data.blob,
                alt: img.alt || ''
            });
        }

        console.log(`📤 Posting with ${embeds.length} images...`);
        const postData = {
            text: rt.text,
            facets: rt.facets,
            embed: {
                $type: 'app.bsky.embed.images',
                images: embeds
            },
            createdAt: new Date().toISOString()
        };

        if (reply) postData.reply = reply;

        const response = await this.agent.post(postData);
        console.log(`✅ Success! URI: ${response.uri}`);
        return { uri: response.uri, cid: response.cid };
    }
}

// Simple test runner
if (require.main === module) {
    const main = async () => {
        const bot = new BlueskyBot();
        try {
            await bot.login();
            
            // Just a test post if run directly
            if (process.argv.includes('--test')) {
                await bot.post('Hello Bluesky! 🧡 This is a test post from my new automation script. #Bitcoin #BBBitcoin');
            }
        } catch (err) {
            console.error('❌ Failed:', err.message);
        }
    };
    main();
}

module.exports = BlueskyBot;

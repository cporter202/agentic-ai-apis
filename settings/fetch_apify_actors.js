/**
 * Fetch Apify store actors and save the raw source data locally for focused
 * repo generation.
 *
 * This script intentionally stores only the raw JSON source. The tracked repo
 * README files are generated separately by generate_readme_clean.js, which
 * filters the catalog down to:
 * - Agents
 * - AI Models
 * - MCP Servers
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'api.apify.com';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function makeRequest(hostname, requestPath, attempt = 0) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path: requestPath,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        };

        const retry = (error) => {
            if (attempt >= MAX_RETRIES) {
                reject(error);
                return;
            }

            const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
            setTimeout(() => {
                makeRequest(hostname, requestPath, attempt + 1)
                    .then(resolve)
                    .catch(reject);
            }, delay);
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const statusCode = res.statusCode || 0;
                const transient = statusCode === 429 || statusCode >= 500;

                if (statusCode < 200 || statusCode >= 300) {
                    const error = new Error(`HTTP ${statusCode}`);
                    error.statusCode = statusCode;

                    if (transient) {
                        retry(error);
                    } else {
                        reject(error);
                    }
                    return;
                }

                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        });

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error('HTTPS request timeout'));
        });

        req.on('error', (error) => {
            retry(error);
        });

        req.end();
    });
}

async function fetchAllActors(limit = 100) {
    const allActors = [];
    let offset = 0;

    console.log('Starting to fetch Apify actors...');

    while (true) {
        try {
            const requestPath = `/v2/store?limit=${limit}&offset=${offset}`;
            console.log(`Fetching actors at offset ${offset}...`);

            const data = await makeRequest(API_BASE_URL, requestPath);
            const actors = data?.data?.items || [];
            const totalCount = data?.data?.total || 0;

            if (actors.length === 0) {
                break;
            }

            for (const actor of actors) {
                const url =
                    actor.url ||
                    (actor.username && actor.name
                        ? `https://apify.com/${actor.username}/${actor.name}`
                        : '');

                allActors.push({
                    name: actor.name || 'Unknown',
                    username: actor.username || '',
                    title: actor.title || actor.name || 'Unknown',
                    description: actor.description || '',
                    url,
                    affiliate_url: url ? `${url}${url.includes('?') ? '&' : '?'}fpr=p2hrc6` : '',
                    stats: actor.stats || {},
                    categories: actor.categories || [],
                    createdAt: actor.createdAt || '',
                    modifiedAt: actor.modifiedAt || '',
                });
            }

            console.log(`Fetched ${allActors.length} actors so far... (Total available: ${totalCount})`);

            if (offset + actors.length >= totalCount) {
                break;
            }

            offset += limit;
            await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`Error fetching actors at offset ${offset}: ${error.message}`);
            throw error;
        }
    }

    return allActors;
}

function saveToJSON(actors, filename = 'apify_actors.json') {
    const filePath = path.join(__dirname, '..', filename);
    fs.writeFileSync(filePath, JSON.stringify(actors, null, 2), 'utf-8');
    console.log(`Saved ${actors.length} actors to ${filename}`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('Apify Actors Fetcher');
    console.log('='.repeat(60));

    try {
        const actors = await fetchAllActors(100);

        if (actors.length === 0) {
            console.log('No actors were fetched. Please check the API connection.');
            return;
        }

        saveToJSON(actors, 'apify_actors.json');
        console.log('Done! Run settings/generate_readme_clean.js to rebuild the focused repo pages.');
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();

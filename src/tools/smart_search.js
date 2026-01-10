const axios = require('axios');
const UserAgent = require('user-agents');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const localQA = require('../core/ai/localQA');
require('dotenv').config();

const SEARXNG_URL = process.env.SEARXNG_URL;

async function fetchPageText(url) {
    try {
        const userAgent = new UserAgent();
        const response = await axios.get(url, {
            headers: { 'User-Agent': userAgent.toString() },
            timeout: 5000,
            responseType: 'text' // Ensure we get text/html
        });

        const dom = new JSDOM(response.data, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article && article.textContent) {
            // Clean up whitespace
            const cleanText = article.textContent.replace(/\s+/g, ' ').trim();
            const rawText = dom.window.document.body.textContent.replace(/\s+/g, ' ').trim();

            // Prepend the first 2000 chars of raw text to catch headers/stats that Readability strips.
            return rawText.substring(0, 2000) + "\n\n" + cleanText.substring(0, 8000);
        }

        // Fallback if readability fails
        return dom.window.document.body.textContent.replace(/\s+/g, ' ').trim().substring(0, 5000);

    } catch (e) {
        console.error(`[SmartSearch] Failed to fetch ${url}:`, e.message);
        return null;
    }
}

async function searchSearXNG(query) {
    if (!SEARXNG_URL) throw new Error("SEARXNG_URL is not configured.");

    try {
        const userAgent = new UserAgent();
        const response = await axios.get(`${SEARXNG_URL}/search`, {
            params: {
                q: query,
                format: 'json',
                language: 'en'
            },
            headers: { 'User-Agent': userAgent.toString() },
            timeout: 5000
        });

        if (response.data && response.data.results) {
            return response.data.results.slice(0, 3);
        }
        return [];

    } catch (e) {
        console.error("[SmartSearch] SearXNG failed:", e.message);
        return [];
    }
}

// --- Logging Helper ---
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(process.cwd(), 'data', 'logs', 'search.log');

// Ensure log dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data', 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data', 'logs'), { recursive: true });
}

function logToSearchFile(header, details) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] === ${header} ===\n${details}\n${'-'.repeat(40)}\n`;
    try {
        fs.appendFileSync(LOG_FILE, entry, 'utf8');
    } catch (e) {
        console.error("Failed to write to search log:", e);
    }
}

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "smart_search",
            description: "Searches the internet and extracts answers to specific questions using a local QA model. Use this for retrieving real-time information.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The specific question to answer (e.g. 'Who is the CEO of Discord?')."
                    },
                    url: {
                        type: "string",
                        description: "Optional. If you want to read a specific page, provide the URL."
                    }
                },
                required: ["query"]
            }
        }
    },

    execute: async ({ query, url }) => {
        const start = Date.now();
        console.log(`[SmartSearch] Processing: "${query}" (URL: ${url ? url : 'None'})`);

        // Log Start
        let logDetails = `Query: "${query}"\nURL: ${url || 'N/A'}`;

        let contexts = [];
        let sources = [];

        // 1. Get Context (from URL or Search)
        if (url) {
            const text = await fetchPageText(url);
            if (text) {
                contexts.push(text);
                sources.push({ url, title: "Provided URL" });
                logDetails += `\nFetched URL: ${url} (${text.length} chars)`;
            }
        } else {
            const results = await searchSearXNG(query);
            logDetails += `\nFound ${results.length} search results via SearXNG.`;

            for (const res of results) {
                sources.push(res);
                logDetails += `\n- [${res.title}](${res.url})`;
            }

            // Fetch top 2 pages
            const pagesToFetch = results.slice(0, 2);
            for (const page of pagesToFetch) {
                const text = await fetchPageText(page.url);
                if (text) {
                    contexts.push(text);
                    logDetails += `\nScraped: ${page.url} (${text.length} chars)`;
                }
            }
        }

        if (contexts.length === 0) {
            logToSearchFile("SEARCH FAILED", logDetails + "\nResult: Failed to retrieve content.");
            return "Failed to retrieve any information from the web.";
        }

        // 2. Run Local QA
        let candidateAnswers = [];

        for (let i = 0; i < contexts.length; i++) {
            const text = contexts[i].replace(/\[\d+\]/g, '').replace(/\s+/g, ' ');
            const source = sources[i] || { title: "Unknown", url: "Unknown" };

            // Chunking
            const chunkSize = 800;
            const overlap = 200;
            for (let j = 0; j < text.length; j += chunkSize - overlap) {
                const chunk = text.substring(j, j + chunkSize);

                // Run QA
                const result = await localQA.answerQuestion(chunk, query);

                // Store everything with even mild relevance
                if (result.score > 0.05) {
                    candidateAnswers.push({
                        answer: result.answer,
                        score: result.score,
                        source: source.title,
                        url: source.url,
                        excerpt: chunk
                    });
                }
            }
        }

        const duration = Date.now() - start;
        logDetails += `\nProcessing Time: ${duration}ms`;

        // Sort by score desc
        candidateAnswers.sort((a, b) => b.score - a.score);

        // Deduplicate excerpts (simple check to avoid near-identical chunks)
        const uniqueAnswers = [];
        const seenExcerpts = new Set();
        for (const ans of candidateAnswers) {
            // Check if this chunk is a substring of an already seen one or vice versa
            let isDuplicate = false;
            for (const seen of seenExcerpts) {
                if (seen.includes(ans.excerpt) || ans.excerpt.includes(seen)) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                uniqueAnswers.push(ans);
                seenExcerpts.add(ans.excerpt);
            }
            if (uniqueAnswers.length >= 3) break; // Keep Top 3
        }

        // Format Output for Mina
        // Threshold lowered to 0.01 to prefer returning context over failing.
        if (uniqueAnswers.length > 0 && uniqueAnswers[0].score > 0.01) {
            const bestAnswer = uniqueAnswers[0];

            // Combine excerpts
            const combinedExcerpt = uniqueAnswers.map(a => `[Source: ${a.source}] ...${a.excerpt}...`).join('\n\n');

            const resultStr = JSON.stringify({
                answer: bestAnswer.answer,
                confidence: bestAnswer.score,
                source: bestAnswer.source,
                url: bestAnswer.url,
                context_excerpt: combinedExcerpt.replace(/\n/g, ' ')
            });

            logToSearchFile("SEARCH SUCCESS", logDetails + `\nTop Answer: "${bestAnswer.answer}" (${bestAnswer.score.toFixed(2)})\nCombined Context Length: ${combinedExcerpt.length} chars`);
            console.log(`[SmartSearch] Success: ${bestAnswer.answer} (Top Score: ${(bestAnswer.score * 100).toFixed(1)}%)`);
            return resultStr;
        } else {
            const errorMsg = "Could not find a confident answer in the search results.";
            logToSearchFile("SEARCH LOW CONFIDENCE", logDetails + `\nNo answers found above 0.01 threshold.`);
            console.log(`[SmartSearch] Failed: Low confidence.`);
            return JSON.stringify({
                error: errorMsg,
                top_results: sources.map(s => s.title)
            });
        }
    }
};

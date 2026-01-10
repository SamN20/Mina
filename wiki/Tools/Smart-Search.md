# Smart Search Tool

**File:** `src/tools/smart_search.js`

The Smart Search tool allows Mina to search the internet for real-time information and extract specific answers using a local AI model.

## Features

*   **Privacy-Focused**: Uses a local **SearXNG** instance to perform searches.
*   **Ad-Free Reading**: Uses Mozilla's **Readability** engine to strip ads, navigation, and clutter from webpages.
*   **Local Intelligence**: Runs a local **Extractive QA Model** to find answers. 
    *   **Configurable**: Model can be changed via `LOCAL_QA_MODEL` in `.env` (Default: `Xenova/distilbert-base-uncased-distilled-squad`).
*   **Header Awareness**: Scans the "raw" top-of-page text (first 2000 chars) in addition to the main article to catch stats/scores.
*   **Multi-Fact Context**: Aggregates the **Top 3 Unique** text chunks that contain relevant answers. This ensures the AI sees multiple facts (e.g. "Score: 97" AND "Rank: 5th") even if they are in different paragraphs.
*   **Robust Retrieval**: Uses a low confidence threshold (0.01) to prioritize returning *context* over failing. If the Local QA isn't 100% sure, it passes the text to the Main AI to decide.
*   **Logging**: All searches are logged to `data/logs/search.log` for review.

## Architecture

| Component | Responsibility |
| :--- | :--- |
| **SearXNG** | Aggregates search results from multiple engines (Google, DDG, etc.) via a local API. |
| **Header Extraction** | Captures the first 2000 characters of raw text to catch metadata/stats. |
| **Readability** | Cleanly extracts the main body of the article. |
| **Local QA** | Scans all text chunks (800 chars) and scores them against the query. |
| **Aggregator** | Selects the **Top 3** scoring chunks, combines them, and returns rich context. |

## Usage

This tool is automatically available to the AI. It will use it when asked questions like:
*   "What is the stock price of Apple?"
*   "Who won the 2024 Super Bowl?"
*   "Search for the latest Node.js release."

### Manual Execution

You can run the tool via script for testing:

```bash
node scripts/verify-search-local.js
```

## Logs

Search history is saved in:
`data/logs/search.log`

Example Entry:
```
[2026-01-10T12:00:00.000Z] === SEARCH SUCCESS ===
Query: "Who created Discord?"
URL: N/A
Found 3 result(s).
- [Jason Citron - Wikipedia](https://en.wikipedia.org/wiki/Jason_Citron)
Processing Time: 1200ms
Answer: "Jason Citron"
Confidence: 0.99
Source: Jason Citron - Wikipedia
Excerpt: "Jason Citron is an American entrepreneur and software engineer. He is the co-founder and CEO of Discord..."
----------------------------------------
```

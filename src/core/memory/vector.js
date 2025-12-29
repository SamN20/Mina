const { pipeline } = require('@xenova/transformers');

let extractor = null;

async function getExtractor() {
    if (!extractor) {
        console.log("[Memory] Loading embedding model (Xenova/all-MiniLM-L6-v2)...");
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return extractor;
}

async function getEmbedding(text) {
    const pipe = await getExtractor();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
    getEmbedding,
    cosineSimilarity
};

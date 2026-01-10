const { pipeline } = require('@xenova/transformers');
require('dotenv').config();

class LocalQA {
    constructor() {
        this.pipeline = null;
        this.modelName = process.env.LOCAL_QA_MODEL || 'Xenova/distilbert-base-cased-distilled-squad';
        this.loading = false;
    }

    async load() {
        if (this.pipeline) return;
        if (this.loading) {
            // Wait for existing load
            while (this.loading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return;
        }

        try {
            this.loading = true;
            console.log(`[LocalQA] Loading model ${this.modelName}...`);
            this.pipeline = await pipeline('question-answering', this.modelName);
            console.log(`[LocalQA] Model loaded!`);
        } catch (e) {
            console.error("[LocalQA] Failed to load model:", e);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Extracts an answer from the context given a question.
     * @param {string} context - The text to search in.
     * @param {string} question - The question to answer.
     * @returns {Promise<{ answer: string, score: number }>}
     */
    async answerQuestion(context, question) {
        if (!this.pipeline) await this.load();

        try {
            // Xenova QA pipeline signature: (question, context)
            const result = await this.pipeline(question, context);
            return result;
        } catch (e) {
            console.error("[LocalQA] QA Inference failed:", e);
            return { answer: "Error processing text", score: 0 };
        }
    }
}

// Singleton
const qa = new LocalQA();
module.exports = qa;

const vision = require('../features/vision/api');

module.exports = {
    definition: {
        type: 'function',
        function: {
            name: 'vision_analyze',
            description: 'Analyze an image URL to get a description, answer a question, or extract text.',
            parameters: {
                type: 'object',
                properties: {
                    imageUrl: {
                        type: 'string',
                        description: 'The URL of the image to analyze.'
                    },
                    prompt: {
                        type: 'string',
                        description: 'The specific question or instruction for the vision model (e.g. "What is in this image?", "Read the error message"). Defaults to "Describe this image".'
                    },
                    mode: {
                        type: 'string',
                        enum: ['describe', 'text', 'question'],
                        description: 'The mode of analysis. "describe" for general captions, "text" for OCR, "question" for Q&A.'
                    }
                },
                required: ['imageUrl']
            }
        }
    },
    execute: async ({ imageUrl, prompt, mode }) => {
        try {
            return await vision.analyzeImage(imageUrl, prompt, mode);
        } catch (e) {
            return `Failed to analyze image: ${e.message}`;
        }
    }
};

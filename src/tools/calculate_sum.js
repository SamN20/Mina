module.exports = {
    // JSON Schema Definition for the tool
    definition: {
        type: "function",
        function: {
            name: "calculate_sum",
            description: "Calculates the sum of two numbers. Useful for testing tool calls.",
            parameters: {
                type: "object",
                properties: {
                    a: { type: "number", description: "First number" },
                    b: { type: "number", description: "Second number" }
                },
                required: ["a", "b"]
            }
        }
    },

    // Execution Logic
    execute: async ({ a, b }) => {
        const result = Number(a) + Number(b);
        return { result: result, message: `The sum of ${a} and ${b} is ${result}.` };
    }
};

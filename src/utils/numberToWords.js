/**
 * Convert numbers to words for TTS
 * @param {string|number} text 
 * @returns {string}
 */
function numberToWords(text) {
    if (typeof text !== 'string') text = text.toString();

    // Simple regex replacer for common small numbers 
    // or a basic implementation. 
    // Since we don't want to add dependencies like 'number-to-words', 
    // we'll implement a basic one or just handle digits 0-99 which is most common for timers.

    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

    return text.replace(/\b\d+\b/g, (match) => {
        let num = parseInt(match);
        if (num === 0) return 'zero';
        if (num >= 100) return match; // Keep large numbers as digits for now

        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];

        const digitOne = num % 10;
        const digitTen = Math.floor(num / 10);

        return `${tens[digitTen]}${digitOne ? ' ' + ones[digitOne] : ''}`;
    });
}

module.exports = numberToWords;

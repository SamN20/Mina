const soundboard = require('./src/features/soundboard/utils');

console.log('--- Hallucination Cleaning ---');
const example = "That was cute! [imagesound: awwww] Thanks.";
console.log(`Input: "${example}"`);
console.log(JSON.stringify(soundboard.parseMixedAudio(example), null, 2));

const mixed = "Mina [sound:rimshot] [imagesound: ignored] Test";
console.log(`\nInput: "${mixed}"`);
console.log(JSON.stringify(soundboard.parseMixedAudio(mixed), null, 2));

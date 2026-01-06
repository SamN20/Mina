/**
 * Example: Manually Control VRM Animations
 * This shows how to trigger animations programmatically
 */

const satellite = require('./src/integrations/satellite');

// Example 1: Simple Wave
function exampleWave() {
    satellite.playGesture('VRM_DISPLAY', 'Waving', 2.0);
    console.log('Mina is waving!');
}

// Example 2: Express Happiness
function exampleHappy() {
    satellite.setExpression('VRM_DISPLAY', 'happy', 0.8, 0);
    satellite.playGesture('VRM_DISPLAY', 'Joyful Jump', 2.5);
    console.log('Mina is happy!');
}

// Example 3: Animation Sequence
async function exampleSequence() {
    console.log('Starting animation sequence...');
    
    // 1. Dance
    satellite.playGesture('VRM_DISPLAY', 'Hip Hop Dancing', 4.0);
    satellite.setExpression('VRM_DISPLAY', 'happy', 0.8, 4.0);
    
    // 2. After 5 seconds, jump
    setTimeout(() => {
        satellite.playGesture('VRM_DISPLAY', 'Joyful Jump', 2.0);
        satellite.setExpression('VRM_DISPLAY', 'happy', 1.0, 2.0);
    }, 5000);
    
    // 3. After 8 seconds, wave
    setTimeout(() => {
        satellite.playGesture('VRM_DISPLAY', 'Waving', 2.5);
    }, 8000);
    
    console.log('Sequence started!');
}

// Example 4: Conversation Flow
function exampleConversation() {
    console.log('Simulating conversation...');
    
    // Greeting
    satellite.playGesture('VRM_DISPLAY', 'wave', 2.0);
    satellite.setExpression('VRM_DISPLAY', 'happy', 0.7, 3.0);
    
    setTimeout(() => {
        // Listening - lean forward
        satellite.playPose('VRM_DISPLAY', 'lean_forward', 3.0);
    }, 3000);
    
    setTimeout(() => {
        // Thinking about response
        satellite.playGesture('VRM_DISPLAY', 'think', 2.0);
    }, 6000);
    
    setTimeout(() => {
        // Point while explaining
        satellite.playGesture('VRM_DISPLAY', 'point', 1.5);
    }, 8500);
    
    setTimeout(() => {
        // Nod to confirm
        satellite.playGesture('VRM_DISPLAY', 'nod', 1.5);
    }, 10000);
}

// Example 5: Mood-based Animation
function exampleMoodAnimation(moodLevel) {
    console.log(`Setting animation for mood level: ${moodLevel}`);
    
    if (moodLevel < 20) {
        // Happy mood
        satellite.setExpression('VRM_DISPLAY', 'happy', 0.8, 0);
        satellite.playGesture('VRM_DISPLAY', 'cheer', 2.0);
    } else if (moodLevel < 50) {
        // Neutral
        satellite.setExpression('VRM_DISPLAY', 'relaxed', 0.5, 0);
    } else if (moodLevel < 80) {
        // Annoyed
        satellite.setExpression('VRM_DISPLAY', 'angry', 0.5, 0);
        satellite.playPose('VRM_DISPLAY', 'cross_arms', 3.0);
    } else {
        // Angry
        satellite.setExpression('VRM_DISPLAY', 'angry', 1.0, 0);
        satellite.playPose('VRM_DISPLAY', 'hands_on_hips', 3.0);
    }
}

// Example 6: Reaction to Event
function exampleReaction(eventType) {
    console.log(`Reacting to: ${eventType}`);
    
    switch(eventType) {
        case 'user_joined':
            satellite.playGesture('VRM_DISPLAY', 'wave', 2.0);
            satellite.setExpression('VRM_DISPLAY', 'happy', 0.7, 3.0);
            break;
            
        case 'user_left':
            satellite.playGesture('VRM_DISPLAY', 'wave', 2.0);
            satellite.setExpression('VRM_DISPLAY', 'sad', 0.4, 2.0);
            break;
            
        case 'funny_message':
            satellite.playEmote('VRM_DISPLAY', 'laugh', 3.0, 0.9);
            break;
            
        case 'surprising_news':
            satellite.playEmote('VRM_DISPLAY', 'surprised', 2.0, 0.9);
            break;
            
        case 'victory':
            satellite.playGesture('VRM_DISPLAY', 'cheer', 3.0);
            satellite.playGesture('VRM_DISPLAY', 'jump', 2.0);
            break;
            
        case 'defeat':
            satellite.playEmote('VRM_DISPLAY', 'sad', 2.5, 0.7);
            break;
    }
}

// Example 7: Teaching/Explaining Animation
function exampleTeaching() {
    console.log('Teaching mode activated');
    
    // Start with confident pose
    satellite.playPose('VRM_DISPLAY', 'hands_on_hips', 2.0);
    
    setTimeout(() => {
        // Lean forward to engage
        satellite.playPose('VRM_DISPLAY', 'lean_forward', 2.0);
    }, 2500);
    
    setTimeout(() => {
        // Point to emphasize
        satellite.playGesture('VRM_DISPLAY', 'point', 1.5);
    }, 5000);
    
    setTimeout(() => {
        // Nod for confirmation
        satellite.playGesture('VRM_DISPLAY', 'nod', 1.5);
    }, 7000);
}

// Example 8: Check Connection
function checkConnection() {
    if (satellite.hasConnection('VRM_DISPLAY')) {
        console.log('✅ VRM Display is connected!');
        return true;
    } else {
        console.log('❌ VRM Display is not connected');
        console.log('Start the satellite client first');
        return false;
    }
}

// Export for use in other modules
module.exports = {
    exampleWave,
    exampleHappy,
    exampleSequence,
    exampleConversation,
    exampleMoodAnimation,
    exampleReaction,
    exampleTeaching,
    checkConnection
};

// Run examples if called directly
if (require.main === module) {
    console.log('VRM Animation Examples');
    console.log('======================\n');
    
    // Check if connected first
    if (!checkConnection()) {
        console.log('\n⚠️  No VRM display connected. These examples won\'t do anything visible.');
        console.log('Start the satellite client and try again.\n');
        process.exit(0);
    }
    
    // Uncomment to run examples:
    
    // exampleWave();
    
    // setTimeout(() => exampleHappy(), 3000);
    
    // exampleSequence();
    
    // exampleConversation();
    
    // exampleMoodAnimation(25); // Try different values: 0, 30, 60, 90
    
    // exampleReaction('user_joined'); // Try: user_left, funny_message, victory
    
    // exampleTeaching();
    
    console.log('\nExamples ready! Uncomment code in the file to run them.');
}

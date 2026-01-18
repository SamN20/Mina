const fs = require('fs');
const path = require('path');

const NOTES_FILE = path.join(process.cwd(), 'data', 'notes.json');

// Ensure data dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
}

let notesData = {};

function loadNotes() {
    if (fs.existsSync(NOTES_FILE)) {
        try {
            notesData = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
        } catch (e) {
            console.error('[Notes] Failed to load notes:', e);
            notesData = {};
        }
    }
}

function saveNotes() {
    try {
        fs.writeFileSync(NOTES_FILE, JSON.stringify(notesData, null, 2));
    } catch (e) {
        console.error('[Notes] Failed to save notes:', e);
    }
}

loadNotes();

function addNote(userId, content) {
    if (!notesData[userId]) {
        notesData[userId] = [];
    }

    const note = {
        id: Date.now().toString().slice(-6), // Short ID
        content: content,
        date: new Date().toISOString()
    };

    notesData[userId].push(note);
    saveNotes();
    return note;
}

function getNotes(userId) {
    return notesData[userId] || [];
}

function deleteNote(userId, noteId) {
    if (!notesData[userId]) return false;

    const initialLength = notesData[userId].length;
    notesData[userId] = notesData[userId].filter(n => n.id !== noteId);

    if (notesData[userId].length !== initialLength) {
        saveNotes();
        return true;
    }
    return false;
}

function clearNotes(userId) {
    if (notesData[userId]) {
        delete notesData[userId];
        saveNotes();
        return true;
    }
    return false;
}

module.exports = {
    addNote,
    getNotes,
    deleteNote,
    clearNotes
};

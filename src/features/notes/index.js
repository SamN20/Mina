const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const notesStore = require('./store');

// Comand: Add Note
registry.register({
    id: 'NOTE_ADD',
    patterns: [
        /^!note (.+)$/i,
        /^note: (.+)$/i,
        /^make a note (.+)$/i,
        /^take a note (.+)$/i
    ],
    execute: async (text, context, matches) => {
        const content = matches[1].trim();
        const note = notesStore.addNote(context.userId, content);
        return { [ActionType.TTS_SPEAK]: `Note saved. ID: ${note.id}` };
    }
});

// Command: List Notes
registry.register({
    id: 'NOTE_LIST',
    patterns: [
        /^!notes$/i,
        /^!listnotes$/i,
        /^read my notes$/i
    ],
    execute: async (text, context) => {
        const notes = notesStore.getNotes(context.userId);
        if (notes.length === 0) {
            return { [ActionType.TTS_SPEAK]: "You don't have any notes." };
        }

        const list = notes.map(n => `[ID ${n.id}]: ${n.content}`).join('\n');
        // If list is long, maybe DM? For now, speak/text.
        // For TTS, reading ID might be annoying, but useful for deletion.

        return {
            [ActionType.TTS_SPEAK]: `You have ${notes.length} notes.`,
            [ActionType.SEND_DM]: {
                userId: context.userId,
                message: `**Your Notes:**\n${list}`
            }
        };
    }
});

// Command: Delete Note
registry.register({
    id: 'NOTE_DELETE',
    patterns: [
        /^!delnote (\d+)$/i,
        /^delete note (\d+)$/i
    ],
    execute: async (text, context, matches) => {
        const id = matches[1];
        const success = notesStore.deleteNote(context.userId, id);
        if (success) {
            return { [ActionType.TTS_SPEAK]: `Deleted note ${id}.` };
        } else {
            return { [ActionType.TTS_SPEAK]: `Note ${id} not found.` };
        }
    }
});

module.exports = {};

const notesStore = require('../features/notes/store');

module.exports = {
    definition: {
        type: 'function',
        function: {
            name: 'manage_notes',
            description: 'Manages user notes. Can add, list, or delete notes.',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['add', 'list', 'delete'],
                        description: 'The action to perform.'
                    },
                    content: {
                        type: 'string',
                        description: 'The content of the note (required for "add").'
                    },
                    noteId: {
                        type: 'string',
                        description: 'The ID of the note to delete (required for "delete").'
                    }
                },
                required: ['action']
            }
        }
    },
    execute: async ({ action, content, noteId }, context) => {
        if (!context || !context.userId) {
            return "Error: User context required.";
        }

        switch (action) {
            case 'add':
                if (!content) return "Error: Content required for adding a note.";
                const note = notesStore.addNote(context.userId, content);
                return `Note saved with ID ${note.id}.`;

            case 'list':
                const notes = notesStore.getNotes(context.userId);
                if (notes.length === 0) return "No notes found.";
                return "Your Notes:\n" + notes.map(n => `- [${n.id}] ${n.content}`).join('\n');

            case 'delete':
                if (!noteId) return "Error: Note ID required for deletion.";
                const success = notesStore.deleteNote(context.userId, noteId);
                return success ? `Note ${noteId} deleted.` : `Note ${noteId} not found.`;

            default:
                return "Invalid action.";
        }
    }
};

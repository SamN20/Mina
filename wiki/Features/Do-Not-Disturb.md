# Do Not Disturb

Mina allows users to toggle a "Do Not Disturb" mode on their current voice channel. This feature is useful for signaling to other server members that the current voice session is private, busy, or otherwise not open to interruptions.

## Usage

**Voice Commands:**
* "Turn on do not disturb"
* "Turn off do not disturb"
* "Toggle do not disturb"
* "Do not disturb"

## Behavior
* **Enable:** Adds `[DND] ` to the start of the channel name.
* **Disable:** Removes `[DND] ` from the start of the channel name.
* **Auto-Disable:** When the user who enabled DND leaves the voice channel, the `[DND]` tag is automatically removed.

## Technical Details

### Permissions
* The bot requires the `Manage Channels` permission to rename voice channels. If this permission is missing, the bot will inform the user.

### State Management
* The system tracks which user enabled DND for which channel.
* This state persists across bot restarts (`data/dnd_state.json`) to ensure that if the bot crashes, it can still clean up or manage the state correctly (though currently, cleanup is triggered by live events).

### Rate Limits
* Discord imposes a rate limit on channel renaming (2 updates per 10 minutes). If the bot hits this limit, it will inform the user.

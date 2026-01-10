# Database Specifications

Mina employs a localized, file-based structured storage system. This design minimizes external dependencies and facilitates portability.

## Storage Location
All persistent data is located within the `data/` directory relative to the application root.

## Data Structures

### 1. User Memory (`data/memory.json`)
The core long-term storage for user-associated facts and vectors.

*   **Format**: JSON
*   **Key**: Discord User Snowflake ID
*   **Schema**:
    ```json
    {
      "USER_ID": {
        "displayName": "String",
        "bio": "String",
        "memories": [
          {
            "text": "String (The factual statement)",
            "category": "String (e.g., 'gaming', 'personal')",
            "embedding": "[Float Array] (Vector representation)",
            "timestamp": "Number (Unix Epoch)"
          }
        ]
      }
    }
    ```

### 2. Configuration (`data/settings.json`)
Stores runtime configuration parameters. Use this file to modify wake words and channel allowlists without altering source code.

*   **Format**: JSON
*   **Parameters**:
    *   `wakeWords`: Array of strings used for activation.
    *   `allowedChannels`: Array of Channel IDs for text responses.
    *   `featureFlags`: Boolean toggles for system capabilities.

### 3. Analytics (`data/activity.json`)
Aggregates usage metrics for system monitoring and social graph generation.

*   **Format**: JSON
*   **Metrics**:
    *   `voice_time`: Cumulative milliseconds per user.
    *   `interactions`: Count of commands issued.
    *   `heatmap`: Activity frequency by hour/day.

### 4. Transcripts (`data/transcripts/`)
Verbatim logs of processed speech. Files are rotated daily.

*   **Format**: Plain Text
*   **Naming Convention**: `YYYY-MM-DD.txt`

## Backup and Recovery
*   **Backup**: Replication of the `data/` directory constitutes a full state backup.
*   **Disaster Recovery**: Restoration involves placing the backed-up `data/` folder into the clean application directory.

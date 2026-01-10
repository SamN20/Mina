#!/bin/bash

# Configuration
WIKI_DIR="wiki"
TEMP_DIR="wiki_temp"
GIT_REMOTE=$(git config --get remote.origin.url)
WIKI_REMOTE="${GIT_REMOTE%.git}.wiki.git"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Deploying Wiki to GitHub...${NC}"

# Check if wiki dir exists
if [ ! -d "$WIKI_DIR" ]; then
    echo -e "${RED}Error: Directory '$WIKI_DIR' not found.${NC}"
    exit 1
fi

# Clean up previous temp dir if it exists
if [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi

# Clone the wiki repo
echo "Cloning $WIKI_REMOTE..."
git clone "$WIKI_REMOTE" "$TEMP_DIR"

if [ ! -d "$TEMP_DIR" ]; then
    echo -e "${RED}Error: Failed to clone wiki repository. Does it exist on GitHub?${NC}"
    echo "You must manually create the first page in the Wiki tab on GitHub to initialize the repo."
    exit 1
fi

# Sync files
echo "Syncing files..."
# Copy content from wiki/ to temp/, excluding .git
# We use rsync if available, else cp
if command -v rsync &> /dev/null; then
    rsync -av --exclude='.git' "$WIKI_DIR/" "$TEMP_DIR/"
else
    cp -r "$WIKI_DIR/"* "$TEMP_DIR/"
fi

# Navigate to temp dir
cd "$TEMP_DIR"

# Check for changes
if [[ -z $(git status -s) ]]; then
    echo -e "${GREEN}No changes to deploy.${NC}"
    cd ..
    rm -rf "$TEMP_DIR"
    exit 0
fi

# Commit and Push
echo "Committing and Pushing..."
git add .
git commit -m "Docs update: $(date)"
git push origin master

# Cleanup
cd ..
rm -rf "$TEMP_DIR"

echo -e "${GREEN}Wiki deployed successfully!${NC}"

#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Planning Poker Bot Update Script${NC}"
echo "=================================="

# Configuration
BOT_DIR="/opt/planning-poker-bot"
SERVICE_NAME="planning-poker-bot"
BACKUP_DIR="$BOT_DIR/backups"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root${NC}"
   exit 1
fi

# Check if bot directory exists
if [ ! -d "$BOT_DIR" ]; then
    echo -e "${RED}❌ Bot directory $BOT_DIR not found${NC}"
    exit 1
fi

cd "$BOT_DIR"

echo -e "${YELLOW}📋 Step 1: Creating backup...${NC}"
python3 scripts/backup_data.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup created successfully${NC}"
else
    echo -e "${RED}❌ Backup failed${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 2: Stopping bot service...${NC}"
sudo systemctl stop "$SERVICE_NAME"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Bot service stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Service might not be running${NC}"
fi

echo -e "${YELLOW}📋 Step 3: Updating code...${NC}"
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Code updated successfully${NC}"
else
    echo -e "${RED}❌ Git pull failed${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 4: Installing dependencies...${NC}"
pip3 install -r requirements.txt
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 5: Starting bot service...${NC}"
sudo systemctl start "$SERVICE_NAME"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Bot service started${NC}"
else
    echo -e "${RED}❌ Failed to start bot service${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 6: Checking service status...${NC}"
sleep 5
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${GREEN}✅ Bot is running successfully${NC}"
else
    echo -e "${RED}❌ Bot failed to start${NC}"
    echo "Check logs with: sudo journalctl -u $SERVICE_NAME -f"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Bot updated successfully!${NC}"
echo "=================================="
echo "Service status: sudo systemctl status $SERVICE_NAME"
echo "View logs: sudo journalctl -u $SERVICE_NAME -f"
echo "Bot logs: tail -f $BOT_DIR/data/bot.log"

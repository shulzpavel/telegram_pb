# Planning Poker Bot - Setup Guide

## 🔧 Initial Setup

### 1. Environment Configuration

Create your environment file:
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```env
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_here
TARGET_CHAT_ID=your_chat_id_here
HARD_ADMIN=@your_username

# Jira Configuration
JIRA_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@domain.com
JIRA_TOKEN=your_jira_token_here
STORY_POINTS_FIELD=customfield_10022
```

### 2. Data Files Setup

Copy example files and configure them:

```bash
# Copy example files
cp data/tokens.json.example data/tokens.json
cp data/group_configs.json.example data/group_configs.json
cp data/sessions.json.example data/sessions.json
cp data/user_roles.json.example data/user_roles.json
```

### 3. Configure Tokens

Edit `data/tokens.json`:
```json
{
  "your_chat_id_0": "user_token",
  "your_chat_id_lead": "lead_token", 
  "your_chat_id_admin": "admin_token"
}
```

### 4. Configure Group Settings

Edit `data/group_configs.json`:
```json
{
  "your_chat_id_0": {
    "chat_id": "your_chat_id",
    "topic_id": "0",
    "jira_url": "https://your-domain.atlassian.net",
    "jira_username": "your-email@domain.com",
    "jira_token": "your_jira_token",
    "story_points_field": "customfield_10022",
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

### 5. Initialize User Roles

Edit `data/user_roles.json`:
```json
{
  "your_chat_id_0": {}
}
```

## 🚀 Running the Bot

### Development Mode
```bash
python3 run_local.py
```

### Production Mode
```bash
python3 run_new_bot.py
```

## 🔐 Security Notes

- **Never commit** `.env` files
- **Never commit** `data/*.json` files (except examples)
- **Never commit** tokens or sensitive data
- All sensitive files are in `.gitignore`

## 📁 File Structure

```
data/
├── .gitkeep                    # Keep directory structure
├── tokens.json.example         # Example tokens
├── group_configs.json.example  # Example group configs
├── sessions.json.example       # Example sessions
└── user_roles.json.example     # Example user roles
```

## 🎯 Usage

1. **Join Session**: `/join user_token` (or `lead_token`, `admin_token`)
2. **View Participants**: Click "👥 Участники" to see roles
3. **Start Planning**: Use the bot interface

## 🔧 Troubleshooting

- Check logs in `data/bot.log`
- Verify environment variables
- Ensure all data files exist
- Check Jira connection

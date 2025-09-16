# 🎯 Planning Poker Bot

Professional Telegram bot for conducting Planning Poker sessions with multi-group and multi-topic support.

## ✨ Features

- **Multi-group Support**: Manage multiple chat groups and topics simultaneously
- **JQL Integration**: Import tasks directly from Jira using JQL queries
- **Flexible Voting**: Customizable voting scales and timeouts
- **Real-time Results**: Live voting results and statistics
- **Admin Controls**: Role-based access control and session management
- **Data Persistence**: Automatic backup and restore of sessions
- **Production Ready**: Docker support, systemd service, and CI/CD pipeline

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Jira credentials (optional, for JQL integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd planning-poker-bot
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Run the bot**
   ```bash
   python bot.py
   ```

### Docker Installation

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run manually
docker build -t planning-poker-bot .
docker run -d --name planning-poker-bot \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env \
  planning-poker-bot
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
BOT_TOKEN=your_bot_token_here

# Optional
JIRA_BASE_URL=https://your-jira-instance.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_TOKEN=your_jira_api_token

# Admin
HARD_ADMIN=@your_username

# Groups (JSON format)
GROUPS_CONFIG='[{"chat_id": -1002718440199, "topic_id": 2, "admins": ["@admin1"], "timeout": 90, "scale": ["1", "2", "3", "5", "8", "13"], "is_active": true}]'
```

### Multiple Groups Configuration

You can configure multiple groups using JSON format:

```json
[
  {
    "chat_id": -1002718440199,
    "topic_id": 2,
    "admins": ["@admin1", "@admin2"],
    "timeout": 90,
    "scale": ["1", "2", "3", "5", "8", "13"],
    "is_active": true
  },
  {
    "chat_id": -1002718440198,
    "topic_id": 1,
    "admins": ["@admin3"],
    "timeout": 120,
    "scale": ["1", "2", "3", "5", "8", "13", "21"],
    "is_active": true
  }
]
```

## 🎮 Usage

### Starting a Session

1. **Send tasks** to the bot:
   - JQL query: `project = FLEX AND status = 'To Do'`
   - Plain text: `FLEX-123 - Create main page`

2. **Vote** on tasks using the provided buttons

3. **View results** when voting is complete

### Commands

- `/start` - Start the bot
- `/help` - Show help information
- `/admin` - Admin panel (admin only)

## 🛠️ Development

### Setup Development Environment

```bash
# Install development dependencies
make install-dev

# Format code
make format

# Run linting
make lint

# Run tests
make test

# Run the bot
make run
```

### Code Quality

The project uses several tools for code quality:

- **Black** - Code formatting
- **isort** - Import sorting
- **flake8** - Linting
- **mypy** - Type checking
- **pytest** - Testing
- **pre-commit** - Git hooks

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=.

# Run specific test
pytest tests/test_specific.py
```

## 🚀 Deployment

### Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deployment

```bash
# Using systemd
sudo cp planning-poker-bot.service /etc/systemd/system/
sudo systemctl enable planning-poker-bot
sudo systemctl start planning-poker-bot

# Using Docker
docker-compose up -d
```

## 📊 Monitoring

### Logs

```bash
# Application logs
tail -f data/bot.log

# System logs (systemd)
sudo journalctl -u planning-poker-bot -f

# Docker logs
docker logs -f planning-poker-bot
```

### Health Checks

The bot includes health checks for monitoring:

- Docker health check
- Systemd service status
- Log file monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

### Development Guidelines

- Follow PEP 8 style guidelines
- Write tests for new features
- Update documentation
- Use type hints
- Follow conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/planning-poker-bot/issues)
- **Documentation**: [Wiki](https://github.com/your-org/planning-poker-bot/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/planning-poker-bot/discussions)

## 🙏 Acknowledgments

- [aiogram](https://github.com/aiogram/aiogram) - Telegram Bot API framework
- [Jira](https://www.atlassian.com/software/jira) - Issue tracking
- [Planning Poker](https://en.wikipedia.org/wiki/Planning_poker) - Estimation technique

---

**Made with ❤️ for agile teams**
# CrizModo Bot - Discord Timer & Channel Management Bot

A comprehensive Discord bot that provides Pomodoro timer functionality and dynamic voice channel management with MongoDB integration.

## 🎯 Features

### 📚 Pomodoro Timer System
- **Customizable Study Sessions**: Set work, break, and long break durations
- **Interactive Controls**: Start, stop, skip phases with button interactions
- **Progress Tracking**: Visual progress bars and session counters
- **Persistent Settings**: User preferences saved to MongoDB
- **Smart Break Management**: Automatic transitions between work and break phases

### 🔊 Room Active Check (Voice Channel Management)
- **Dynamic Channel Visibility**: Automatically show/hide voice channels based on member count
- **Threshold-Based Control**: Configurable member count triggers
- **Role-Based Access**: Specify which roles can see secondary channels
- **Edge Case Protection**: Prevents hiding channels with active users
- **Database Persistence**: All configurations saved across bot restarts

## 🚀 Getting Started

### Prerequisites
- Node.js 16.9.0 or higher
- MongoDB Atlas account or local MongoDB instance
- Discord Bot Token
- Discord Server with appropriate permissions

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Timer Bot11"
   ```

2. **Install dependencies**
   ```bash
   npm install discord.js mongoose dotenv
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   TOKEN=your_discord_bot_token
   APPLICATION_ID=your_application_id
   CLIENT_ID=your_client_id
   GUILD_ID=your_test_server_id
   PUBLIC_KEY=your_public_key
   DATABASE_URL=your_mongodb_connection_string
   ```

4. **Run the bot**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 🎮 Commands

### Pomodoro Commands

#### `/pomodoro setup`
Configure your Pomodoro timer settings.

**Options:**
- `work` (5-180 minutes) - Work session duration
- `break` (1-60 minutes) - Short break duration  
- `longbreak` (30-120 minutes) - Long break duration
- `sessions` (1-10) - Sessions before long break
- `max-sessions` (1-10, optional) - Maximum total sessions

**Example:**
```
/pomodoro setup work:25 break:5 longbreak:15 sessions:4 max-sessions:8
```

#### `/pomodoro start`
Start a new Pomodoro session with your configured settings.

#### `/pomodoro rest`
Take a manual break (short break duration).

#### `/pomodoro skip`
Skip the current phase (work → break or break → work).

#### `/pomodoro stopsession`
Stop the current Pomodoro session completely.

#### `/pomodoro help`
Get detailed help about Pomodoro commands.

### Room Active Check Commands

#### `/enable-roomactivecheck`
Configure dynamic voice channel visibility.

**Options:**
- `enabled` (true/false) - Enable or disable the feature
- `primary-channel` - Voice channel to monitor for member count
- `secondary-channel` - Voice channel to show/hide based on activity
- `required-role` - Role that can see the secondary channel when active
- `threshold` (1-50, optional) - Member count threshold (default: 10)

**Example:**
```
/enable-roomactivecheck enabled:true primary-channel:#study-hall secondary-channel:#overflow required-role:@Students threshold:15
```

### General Commands

#### `/ping`
Check if the bot is responsive.

## 🏗️ Architecture

### Project Structure
```
Timer Bot11/
├── bot.js                          # Main bot file
├── commands/                       # Slash command definitions
│   ├── pomodoro.js                 # Pomodoro command structure
│   └── roomactivecheck.js          # Room active check command
├── handlers/                       # Command logic handlers
│   ├── pomodoro/                   # Pomodoro-related handlers
│   │   ├── start.js
│   │   ├── stop.js
│   │   ├── skip.js
│   │   ├── rest.js
│   │   ├── setup.js
│   │   └── help.js
│   └── roomactivecheck/            # Voice channel handlers
│       ├── enable.js
│       └── voiceStateUpdate.js
├── utils/                          # Utility functions
│   ├── pomodoroManager.js          # Pomodoro session management
│   └── roomActiveCheckManager.js   # Channel visibility management
├── models/                         # MongoDB models
│   ├── PomodoroUser.js            # User Pomodoro settings
│   └── RoomActiveCheck.js          # Guild channel configurations
├── database/                       # Database connection
│   └── db.js
└── .env                           # Environment variables
```

### Database Models

#### PomodoroUser
Stores individual user Pomodoro preferences:
- User ID
- Work/break/long break durations
- Sessions before long break
- Maximum sessions
- Creation/update timestamps

#### RoomActiveCheck
Stores guild-specific channel management settings:
- Guild ID
- Feature enabled status
- Primary/secondary channel IDs
- Required role ID
- Member count threshold
- Creation/update timestamps

## 🎯 How It Works

### Pomodoro System
1. **Setup**: Users configure their timer preferences using `/pomodoro setup`
2. **Session Start**: `/pomodoro start` creates an interactive session with buttons
3. **Progress Tracking**: Visual progress bars show remaining time
4. **Automatic Transitions**: Sessions automatically switch between work and break phases
5. **User Controls**: Users can skip phases or stop sessions at any time
6. **Persistence**: All settings and active sessions survive bot restarts

### Room Active Check System
1. **Configuration**: Admins set up channel monitoring using `/enable-roomactivecheck`
2. **Voice Monitoring**: Bot listens for voice state changes in configured channels
3. **Dynamic Visibility**: Secondary channel visibility changes based on:
   - Primary channel member count vs threshold
   - Secondary channel occupancy (protection against kicking active users)
4. **Permission Management**: Bot maintains its own permissions while managing user access
5. **Database Storage**: All configurations persist across bot restarts

### Voice Channel Logic
```
if (primary_channel_members >= threshold):
    make_secondary_visible_to_role()
elif (secondary_channel_has_members):
    keep_secondary_visible_to_role()  # Protect active users
else:
    hide_secondary_from_everyone()
```

## 🔧 Configuration

### Bot Permissions Required
- `Manage Channels` - For channel permission management
- `View Channels` - To monitor voice channels
- `Use Slash Commands` - For command functionality
- `Send Messages` - For responses and notifications
- `Manage Roles` - For permission overwrites

### MongoDB Setup
1. Create a MongoDB Atlas cluster or set up local MongoDB
2. Create a database (name is flexible)
3. The bot will automatically create required collections
4. Add connection string to `.env` file

### Discord Bot Setup
1. Create application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create bot user and get token
3. Set up OAuth2 URL with required scopes:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147609616&integration_type=0&scope=bot+applications.commands
   ```

## 🛡️ Error Handling

The bot includes comprehensive error handling:
- **Database Connection**: Automatic reconnection and error logging
- **Missing Channels/Roles**: Graceful degradation with user feedback
- **Permission Issues**: Clear error messages for insufficient permissions
- **Invalid Configurations**: Input validation with helpful error messages
- **Rate Limiting**: Built-in Discord API rate limit handling

## 🔒 Security Features

- **Permission Validation**: Commands check user permissions before execution
- **Input Sanitization**: All user inputs are validated and sanitized
- **Bot Permission Preservation**: Bot always maintains necessary permissions
- **Database Security**: Environment variables protect sensitive credentials
- **Error Privacy**: Detailed errors logged to console, safe messages to users

## 📊 Monitoring & Logging

The bot provides detailed console logging:
- **Startup Events**: Connection status, command registration
- **Command Usage**: User interactions and responses
- **Voice Activity**: Channel member count changes
- **Database Operations**: Success/failure of data persistence
- **Error Tracking**: Detailed error logs with stack traces

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes following the existing code structure
4. Test thoroughly with your bot instance
5. Submit a pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, please:
1. Check the error logs in your console
2. Verify your `.env` configuration
3. Ensure bot has required permissions
4. Check MongoDB connection status
5. Create an issue with detailed error information

## 🎉 Acknowledgments

- Built with [discord.js](https://discord.js.org/) v14
- Database powered by [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/)
- Environment management via [dotenv](https://www.npmjs.com/package/dotenv)

---

**Note**: This bot is designed for educational and productivity purposes. Please respect Discord's Terms of Service and rate limits when using this
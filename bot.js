import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
} from "discord.js";
import {
  data as pomodoroData,
  execute as pomodoroExecute,
} from "./commands/pomodoro.js";
import {
  data as roomActiveCheckData,
  execute as roomActiveCheckExecute,
} from "./commands/roomactivecheck.js";
import {
  data as listMembersData,
  execute as listMembersExecute,
} from "./commands/listMembers.js";
import { connectToCluster } from "./database/db.js";
import { handleRest } from "./handlers/pomodoro/rest.js";
import { handleStart } from "./handlers/pomodoro/start.js";
import { handleSetup } from "./handlers/pomodoro/setup.js";
import { handleStopSession } from "./handlers/pomodoro/stop.js";
import { handleSkip } from "./handlers/pomodoro/skip.js";
import { handleVoiceStateUpdate } from "./handlers/roomactivecheck/voiceStateUpdate.js";
import {
  initializeGuildFeatureState,
  removeGuildFeatureState,
} from "./utils/roomActiveCheckManager.js";
// Add this import for group button handling
import { handleGroupButtonInteraction } from "./handlers/pomodoro/group/buttonHandler.js";
import { handleTicketMessage } from "./handlers/tickets/messageHandler.js";
import { handleSuperVerificationButton } from "./handlers/tickets/superVerificationButtonHandler.js";

// Create a new bot client with voice state intent
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // Added for voice channel monitoring
    GatewayIntentBits.GuildMembers, // Added for member access
    GatewayIntentBits.GuildMessages, // Added for ticket message watching
    GatewayIntentBits.MessageContent, // Added to read ticket message content
  ],
});

// Store commands
client.commands = new Collection();

// Define commands
const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
  pomodoroData.toJSON(),
  roomActiveCheckData.toJSON(),
  listMembersData.toJSON(),
];

// Add commands to collection
client.commands.set("ping", {
  execute: async (interaction) => {
    await interaction.reply("🏓 Pong!");
  },
});
client.commands.set("pomodoro", { execute: pomodoroExecute });
client.commands.set("enable-roomactivecheck", { execute: roomActiveCheckExecute });
client.commands.set("listmembers", { execute: listMembersExecute });

// Initialize REST API
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// Register the slash commands
async function registerCommands() {
  try {
    console.log("🚀 Registering slash commands for guild...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands registered for guild successfully!");
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }
}

// When the bot is ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Initialize room active check feature state for all guilds from database
  console.log("🔧 Initializing room active check system from database...");

  const initPromises = client.guilds.cache.map((guild) =>
    initializeGuildFeatureState(guild.id)
  );

  try {
    await Promise.all(initPromises);
    console.log("✅ Room active check system initialized from database");
  } catch (error) {
    console.error("❌ Error initializing room active check system:", error);
  }
});

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
    await interaction.reply({
      content: "❌ An error occurred while executing this command.",
      flags: 64,
    });
  }
});

// Handle button interactions
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // Handle group button interactions FIRST (they have specific patterns)
    if (interaction.customId.startsWith('group_')) {
      return await handleGroupButtonInteraction(interaction, client);
    }

    // Super Verification approve/reject buttons
    if (interaction.customId.startsWith('superverify_')) {
      return await handleSuperVerificationButton(interaction, client);
    }

    // Handle your existing group buttons (if any)
    if (interaction.customId.startsWith('skip_phase_') || interaction.customId.startsWith('stop_group_')) {
      // Your existing group button logic here
      console.log("Handling existing group button:", interaction.customId);
      return;
    }
    
    // Individual Pomodoro buttons
    switch (interaction.customId) {
      case "start_session":
        return handleStart(interaction, client);
      case "stop_session":
        return handleStopSession(interaction);
      case "skip_phase":
        return handleSkip(interaction);
    }
  }
});

// Handle voice state updates for room active check
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

// Handle messages in ticket channels (Super Verification, future FAQ auto-reply)
client.on(Events.MessageCreate, async (message) => {
  try {
    await handleTicketMessage(message, client);
  } catch (error) {
    console.error("❌ Error handling ticket message:", error);
  }
});

// Handle guild join events (set default feature state)
client.on(Events.GuildCreate, async (guild) => {
  try {
    await initializeGuildFeatureState(guild.id);
    console.log(
      `🆕 Joined new guild and initialized database: ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(`❌ Error initializing guild ${guild.id}:`, error);
  }
});

// Handle guild leave events (cleanup feature state)
client.on(Events.GuildDelete, async (guild) => {
  try {
    await removeGuildFeatureState(guild.id);
    console.log(
      `👋 Left guild and cleaned up database: ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(`❌ Error cleaning up guild ${guild.id}:`, error);
  }
});

const uri = process.env.DATABASE_URL;

// Start the bot
async function main() {
  try {
    await registerCommands();
    await connectToCluster(uri);
    console.log("💾 Database connected successfully");

    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error("❌ Error starting bot:", error);
    process.exit(1);
  }

  // Catch unhandled exceptions
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled Rejection:", error);
  });
}

main();
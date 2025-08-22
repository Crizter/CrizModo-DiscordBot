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

// Create a new bot client with voice state intent
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // Added for voice channel monitoring
    GatewayIntentBits.GuildMembers, // Added for member access
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
  listMembersData.toJSON(), // Add this line
];

// Add commands to collection
client.commands.set("ping", {
  execute: async (interaction) => {
    await interaction.reply("🏓 Pong!");
  },
});
client.commands.set("pomodoro", { execute: pomodoroExecute });
client.commands.set("enable-roomactivecheck", { execute: roomActiveCheckExecute });
client.commands.set("listmembers", { execute: listMembersExecute }); // Add this line

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
      flags: 64, // 64 = ephemeral
    });
  }
});

// Handle button interactions for Pomodoro AND ListMembers
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // Pomodoro buttons
    switch (interaction.customId) {
      case "start_session":
        return handleStart(interaction, client);
      case "stop_session":
        return handleStopSession(interaction);
      case "skip_phase":
        return handleSkip(interaction);
    }
    
    // ListMembers buttons are handled within the createMemberListEmbed function
    // No need to add them here since they're handled by the collector in the handler
  }
});

// Handle voice state updates for room active check
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

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
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
import {
  data as setupDeepFocusData,
  execute as setupDeepFocusExecute,
} from "./commands/setupDeepFocus.js";
import {
  data as deepFocusData,
  execute as deepFocusExecute,
} from "./commands/deepfocus.js";
import { connectToCluster } from "./database/db.js";
import { initMysqlSchema, testMysqlConnection } from "./database/mysql.js";
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
import { handleSetupComponent } from "./handlers/deepFocus/setup.js";
import {
  handleActivate,
  handleActivateComponent,
} from "./handlers/deepFocus/activate.js";
import { handleExitButton } from "./handlers/deepFocus/exit.js";
import { startPeriodicSweep } from "./utils/deepFocus/expiryScheduler.js";
import { recoverDeepFocusSessions } from "./utils/deepFocus/recovery.js";

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
  listMembersData.toJSON(),
  setupDeepFocusData.toJSON(),
  deepFocusData.toJSON(),
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
client.commands.set("setupdeepfocus", { execute: setupDeepFocusExecute });
client.commands.set("deepfocus", { execute: deepFocusExecute });

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

  // Deep Focus: recover any in-flight sessions (survived a restart) and arm the sweep
  try {
    await recoverDeepFocusSessions(client);
    startPeriodicSweep(client);
    console.log("✅ Deep Focus recovery + sweep initialized");
  } catch (error) {
    console.error("❌ Error initializing Deep Focus runtime:", error);
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

// Handle button + component interactions
client.on("interactionCreate", async (interaction) => {
  // Deep Focus components (buttons + select menus)
  if (interaction.isButton() || interaction.isAnySelectMenu()) {
    const { customId } = interaction;

    // Admin setup wizard
    if (customId.startsWith("dfsetup_")) {
      return handleSetupComponent(interaction, client);
    }

    // Pickup-message activate buttons
    if (customId === "df_activate_badge") {
      return handleActivate(interaction, client, { withBadge: true });
    }
    if (customId === "df_activate_plain") {
      return handleActivate(interaction, client, { withBadge: false });
    }

    // Ephemeral activation flow (duration/exceptions/confirm)
    if (
      customId === "df_duration_picker" ||
      customId === "df_exceptions_picker" ||
      customId === "df_confirm_badge" ||
      customId === "df_confirm_plain"
    ) {
      return handleActivateComponent(interaction, client);
    }

    // End-early button from the DM / ephemeral fallback
    if (customId.startsWith("df_end_")) {
      return handleExitButton(interaction, client);
    }
  }

  if (interaction.isButton()) {
    // Handle group button interactions FIRST (they have specific patterns)
    if (interaction.customId.startsWith('group_')) {
      return await handleGroupButtonInteraction(interaction, client);
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

    try {
      await testMysqlConnection();
      await initMysqlSchema();
      console.log("💾 MySQL (Deep Focus) connected + schema ready");
    } catch (error) {
      console.error("⚠️ MySQL not available — Deep Focus feature will be disabled:", error.message);
    }

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
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
  data as superverifyData,
  execute as superverifyExecute,
} from "./commands/superverify.js";
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
import { handleSuperVerificationApplyButton } from "./handlers/superVerification/applyButtonHandler.js";
import { handleSuperVerificationContinueButton } from "./handlers/superVerification/continueButtonHandler.js";
import { handleSuperVerificationModalSubmit } from "./handlers/superVerification/modalSubmitHandler.js";
import { handleSuperVerificationButton } from "./handlers/superVerification/reviewButtonHandler.js";
import { SUPER_VERIFICATION_APPLY_CHANNEL_ID } from "./config/constants.js";

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
  superverifyData.toJSON(),
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
client.commands.set("superverify", { execute: superverifyExecute });

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

    // Super Verification buttons — order matters, most specific prefixes first
    if (interaction.customId === 'superverify_apply_start') {
      return await handleSuperVerificationApplyButton(interaction, client);
    }
    if (interaction.customId.startsWith('superverify_continue_')) {
      return await handleSuperVerificationContinueButton(interaction, client);
    }
    if (
      interaction.customId.startsWith('superverify_approve_') ||
      interaction.customId.startsWith('superverify_reject_')
    ) {
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
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('superverify_modal_')) {
      try {
        return await handleSuperVerificationModalSubmit(interaction, client);
      } catch (error) {
        console.error("❌ Error handling super verification modal:", error);
        return interaction.reply({
          content: "❌ Something went wrong processing that step. Please try again.",
          flags: 64,
        });
      }
    }
  }
});

// Handle voice state updates for room active check
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

// Safety net: the Super Verification apply channel should be view-only for
// regular users (set via Discord channel permissions) — auto-delete any
// stray non-bot message there as a backstop.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== SUPER_VERIFICATION_APPLY_CHANNEL_ID) return;
  await message.delete().catch((error) => {
    console.error("❌ Could not delete stray message in apply channel:", error.message);
  });
});

// Handle messages in ticket channels (future FAQ auto-reply)
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
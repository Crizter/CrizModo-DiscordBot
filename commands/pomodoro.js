import { SlashCommandBuilder } from "discord.js";
import { handleStart } from "../handlers/pomodoro/start.js";
import { handleStudy } from "../handlers/pomodoro/study.js";
import { handleStopSession } from "../handlers/pomodoro/stop.js";
import { handleSetup } from "../handlers/pomodoro/setup.js";
import { handleStatus } from "../handlers/pomodoro/status.js";
import { handleRest } from "../handlers/pomodoro/rest.js";
import { handleSkip } from "../handlers/pomodoro/skip.js";
import { handleHelp } from "../handlers/pomodoro/help.js";
import { handleGroupCreate } from "../handlers/pomodoro/group/create.js";
import { handleGroupJoin } from "../handlers/pomodoro/group/join.js";
import { handleGroupLeave } from "../handlers/pomodoro/group/leave.js";
import { handleGroupStatus } from "../handlers/pomodoro/group/status.js";
import { handleGroupEnd } from "../handlers/pomodoro/group/end.js";

export const data = new SlashCommandBuilder()
    .setName("pomodoro")
    .setDescription("Manage your Pomodoro sessions.")
    
    .addSubcommand(subcommand =>
        subcommand.setName("help").setDescription("Get help with Pomodoro commands")        
    )
    .addSubcommand(subcommand =>
        subcommand.setName("start").setDescription("Start a Pomodoro session")
    )
    .addSubcommand(subcommand =>
        subcommand.setName("rest").setDescription("Take a short break")
    )
    .addSubcommand(subcommand =>
        subcommand.setName("stopsession").setDescription("Stop the session")
    )
    .addSubcommand(subcommand =>
        subcommand.setName("skip").setDescription("Skip the current phase")
    )
    .addSubcommand(subcommand => 
        subcommand
            .setName("setup")
            .setDescription("Configure your Pomodoro settings")
            .addIntegerOption(option =>
                option
                    .setName("work")
                    .setDescription("Set work duration in minutes (5-180)")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(180)
            )
            .addIntegerOption(option =>
                option
                    .setName("break")
                    .setDescription("Set break duration in minutes (1-60)")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(60)
            )
            .addIntegerOption(option =>
                option
                    .setName("longbreak")
                    .setDescription("Set long break duration in minutes (30-120)")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(120)
            )
            .addIntegerOption(option =>
                option
                    .setName("sessions")
                    .setDescription("Set number of sessions before long break (max 10)")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(10)
            )
            .addIntegerOption(option => 
                option
                    .setName("max-sessions")
                    .setDescription("Maximum number of total sessions (max 10)")
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(10)
            )
    )
    
    // Group Pomodoro Commands
    .addSubcommandGroup(group =>
        group
            .setName("group")
            .setDescription("Group Pomodoro sessions")
            .addSubcommand(subcommand =>
                subcommand
                    .setName("create")
                    .setDescription("Create a group Pomodoro session")
                    .addIntegerOption(option =>
                        option
                            .setName("work")
                            .setDescription("Work duration in minutes (5-180)")
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(180)
                    )
                    .addIntegerOption(option =>
                        option
                            .setName("break")
                            .setDescription("Break duration in minutes (1-60)")
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(60)
                    )
                    .addIntegerOption(option =>
                        option
                            .setName("longbreak")
                            .setDescription("Long break duration in minutes (30-120)")
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(120)
                    )
                    .addIntegerOption(option =>
                        option
                            .setName("sessions")
                            .setDescription("Sessions before long break (1-10)")
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(10)
                    )
                    .addIntegerOption(option =>
                        option
                            .setName("max-sessions")
                            .setDescription("Maximum total sessions (1-10)")
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(10)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("join")
                    .setDescription("Join a group Pomodoro session")
                    .addStringOption(option =>
                        option
                            .setName("session-id")
                            .setDescription("The session ID to join")
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("leave")
                    .setDescription("Leave the current group session")
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("status")
                    .setDescription("Check current group session status")
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("end")
                    .setDescription("End the group session (host only)")
            )
    );

export async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup();
    
    console.log(`Executing command: /pomodoro ${subcommandGroup ? subcommandGroup + ' ' : ''}${subcommand}`);

    // Handle group commands
    if (subcommandGroup === "group") {
        switch (subcommand) {
            case "create":
                await handleGroupCreate(interaction, client);
                break;
            case "join":
                await handleGroupJoin(interaction, client);
                break;
            case "leave":
                await handleGroupLeave(interaction, client);
                break;
            case "status":
                await handleGroupStatus(interaction, client);
                break;
            case "end":
                await handleGroupEnd(interaction, client);
                break;
            default:
                await interaction.reply({ content: "❌ Invalid group command.", flags: 64 });
        }
        return;
    }

    // Handle individual commands
    switch (subcommand) {
        case "start":
            await handleStart(interaction, client);
            break;
        case "rest":
            await handleRest(interaction);
            break;
        case "stopsession":
            await handleStopSession(interaction);
            break;
        case "study":
            await handleStudy(interaction);
            break;
        case "skip":
            await handleSkip(interaction);
            break;
        case "help":
            await handleHelp(interaction);
            break;
        case "setup":
            const workDuration = interaction.options.getInteger("work");
            const breakDuration = interaction.options.getInteger("break");
            const longBreakDuration = interaction.options.getInteger("longbreak");
            const sessionsBeforeLongBreak = interaction.options.getInteger("sessions");

            await handleSetup(interaction, {
                workDuration,
                breakDuration,
                longBreakDuration,
                sessionsBeforeLongBreak
            }); 
            break;
        default:
            await interaction.reply({ content: "❌ Invalid Pomodoro command.", flags: 64 });
    }
}
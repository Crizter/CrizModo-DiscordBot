import { SlashCommandBuilder } from "discord.js";
import { handleStart } from "../handlers/pomodoro/start.js";
import { handleStudy } from "../handlers/pomodoro/study.js";
import { handleStopSession } from "../handlers/pomodoro/stop.js";
import { handleSetup } from "../handlers/pomodoro/setup.js";
import { handleStatus } from "../handlers/pomodoro/status.js";
import { handleRest } from "../handlers/pomodoro/rest.js";
import { handleSkip } from "../handlers/pomodoro/skip.js";
import { handleHelp } from "../handlers/pomodoro/help.js";

export const data = new SlashCommandBuilder()
    .setName("pomodoro") //   main command name
    .setDescription("Manage your Pomodoro sessions.")
    
    .addSubcommand(subcommad =>
        subcommad.setName("help").setDescription("Get help with Pomodoro commands")        
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
    // .addSubcommand(subcommand =>
    //     subcommand.setName("study").setDescription("Describe your study session")
    // )
    // .addSubcommand(subcommand =>
    //     subcommand.setName("timer").setDescription("Start the timer")
    // )
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
                    .setMinValue(5)
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
                    .setMinValue(30)
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
    
    // .addSubcommand(subcommand =>
    //     subcommand.setName("status").setDescription("Check your current Pomodoro status")
    //   )

export async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    console.log(`Executing command: /pomodoro ${subcommand}`);

    switch (subcommand) {
        case "start":
            await handleStart(interaction,client);
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
            await handleHelp(interaction) ; 
            break ; 
        // case "timer":
        //     await interaction.reply("⏲️ Timer: X minutes remaining.");
        //     break;
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
            // case "status":
            //     await handleStatus(interaction);
            //     break;
           
        default:
            await interaction.reply("❌ Invalid Pomodoro command.");
    }
}



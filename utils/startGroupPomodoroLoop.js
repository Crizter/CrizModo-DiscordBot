import { GroupSession } from "../models/GroupSession.js";
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

const dashboards = new Map(); // sessionId -> { channel, message }
export const activeGroupTimers = new Map(); // Export this so other files can use it

function buildProgressBar(completed, max) {
    const filled = "█".repeat(completed);
    const empty = "░".repeat(max - completed);
    return `${filled}${empty}`;
}

export async function startGroupPomodoroLoop(sessionId, client) {
    // Clear any existing timer
    const existingTimer = activeGroupTimers.get(sessionId);
    if (existingTimer) {
        clearTimeout(existingTimer);
        activeGroupTimers.delete(sessionId);
    }

    const session = await GroupSession.findOne({ sessionId, isActive: true });
    if (!session) {
        console.log(`❌ No active session found: ${sessionId}`);
        return;
    }

    console.log(`🚀 Starting group pomodoro loop for ${sessionId}`);
    console.log(`📊 Current state - Sessions: ${session.completedSessions}/${session.maxSessions}, Phase: ${session.phase}`);

    runPhase(sessionId, client);
}

async function runPhase(sessionId, client) {
    const session = await GroupSession.findOne({ sessionId, isActive: true });
    if (!session) {
        console.log(`❌ Session no longer active: ${sessionId}`);
        activeGroupTimers.delete(sessionId);
        return;
    }

    const {
        workDuration,
        breakDuration,
        longBreakDuration,
        sessionsBeforeLongBreak,
        maxSessions,
        completedSessions,
        phase
    } = session;

    // Check if we've completed all sessions
    if (completedSessions >= maxSessions) {
        await endGroupSession(sessionId, client);
        return;
    }

    // Determine current phase and duration
    let currentPhase = phase;
    let duration;

    if (currentPhase === 'study') {
        duration = workDuration;
    } else if (currentPhase === 'break') {
        duration = breakDuration;
    } else if (currentPhase === 'long_break') {
        duration = longBreakDuration;
    }

    const endTime = new Date(Date.now() + duration * 60 * 1000);
    
    // Update session with current phase timing
    await GroupSession.updateOne(
        { sessionId },
        { 
            actualEndTimestamp: endTime
        }
    );

    console.log(`🔄 Running ${currentPhase} phase for ${duration} minutes`);

    // Send phase notification
    await sendPhaseNotification(sessionId, currentPhase, duration, endTime, client);

    // Set timer for phase completion
    const timerId = setTimeout(() => {
        activeGroupTimers.delete(sessionId);
        handlePhaseCompletion(sessionId, client);
    }, duration * 60 * 1000);

    activeGroupTimers.set(sessionId, timerId);
}

async function handlePhaseCompletion(sessionId, client) {
    const session = await GroupSession.findOne({ sessionId, isActive: true });
    if (!session) return;

    const {
        completedSessions,
        sessionsBeforeLongBreak,
        maxSessions,
        phase
    } = session;

    let nextPhase;
    let shouldIncrementSession = false;

    if (phase === 'study') {
        // Study completed - increment session count and move to break
        shouldIncrementSession = true;
        const newCompletedSessions = completedSessions + 1;

        // Check if we've completed all sessions
        if (newCompletedSessions >= maxSessions) {
            await endGroupSession(sessionId, client);
            return;
        }

        // Determine break type
        if (newCompletedSessions % sessionsBeforeLongBreak === 0) {
            nextPhase = 'long_break';
            console.log(`✅ Study session ${newCompletedSessions} completed - Moving to long break`);
        } else {
            nextPhase = 'break';
            console.log(`✅ Study session ${newCompletedSessions} completed - Moving to short break`);
        }

    } else if (phase === 'break' || phase === 'long_break') {
        // Break completed - move to next study session
        nextPhase = 'study';
        console.log(`☕ Break completed - Moving to next study session`);
    }

    // Update session state
    const updateData = { phase: nextPhase };
    if (shouldIncrementSession) {
        updateData.completedSessions = completedSessions + 1;
    }

    await GroupSession.updateOne({ sessionId }, updateData);

    // Continue to next phase
    runPhase(sessionId, client);
}

async function sendPhaseNotification(sessionId, phase, duration, endTime, client) {
    const session = await GroupSession.findOne({ sessionId });
    if (!session) return;

    // Get active participant IDs
    const userIds = session.participants.filter(p => p.isActive).map(p => p.userId);

    const progressBar = buildProgressBar(session.completedSessions, session.maxSessions);
    
    const phaseNames = {
        study: "📚 Focus Time",
        break: "☕ Short Break",
        long_break: "🌴 Long Break"
    };

    const phaseColors = {
        study: 0x3498db,      // blue - matching individual system
        break: 0xf1c40f,      // yellow
        long_break: 0x2ecc71  // green
    };

    // Calculate timestamp for Discord formatting
    const endTimestamp = Math.floor(endTime.getTime() / 1000);

    const embed = new EmbedBuilder()
        .setTitle(`👥 Group Pomodoro — ${phaseNames[phase]}`)
        .setDescription(
            `⏳ Duration: **${duration} mins**\n` +
            `🕒 **Ends <t:${endTimestamp}:R>** • <t:${endTimestamp}:T>\n\n` +
            `📈 **Progress:**\n\`${progressBar}\``
        )
        .setColor(phaseColors[phase])
        .setFooter({ 
            text: `Session ${session.completedSessions}/${session.maxSessions} • ${sessionId}` 
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`group_skip_${sessionId}`)
            .setLabel("⏭️ Skip Phase")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`group_end_${sessionId}`)
            .setLabel("⛔ Stop Session")
            .setStyle(ButtonStyle.Danger)
    );

    // Update existing dashboard or create new one
    const dashboard = dashboards.get(sessionId);
    if (dashboard?.message) {
        await dashboard.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
    } else {
        try {
            // Find the channel where session was created
            let targetChannel = null;
            for (const [, guild] of client.guilds.cache) {
                if (guild.id === session.guildId) {
                    targetChannel = guild.channels.cache.get(session.channelId);
                    break;
                }
            }

            if (targetChannel) {
                // Mention participants for phase transitions with simpler, cleaner message
                const participantMentions = userIds.map(id => `<@${id}>`).join(' ');
                
                const phaseMessages = {
                    study: `🔥 **Focus time!** Time to concentrate and be productive!`,
                    break: `☕ **Break time!** Take a short rest and recharge!`,
                    long_break: `🌴 **Long break!** You've earned this extended rest!`
                };

                // Send message similar to individual Pomodoro format
                const message = `⏰ ${participantMentions} ${phaseMessages[phase]}`;

                const msg = await targetChannel.send({ 
                    content: message, 
                    embeds: [embed], 
                    components: [row] 
                });
                dashboards.set(sessionId, { message: msg, channel: targetChannel });
            }
        } catch (error) {
            console.error(`❌ Failed to send group message for ${sessionId}:`, error);
        }
    }
}

async function endGroupSession(sessionId, client) {
    const session = await GroupSession.findOneAndUpdate(
        { sessionId },
        { 
            isActive: false, 
            status: 'completed' 
        },
        { new: true }
    );

    if (!session) return;

    // Clear timer and dashboard
    const timer = activeGroupTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        activeGroupTimers.delete(sessionId);
    }

    const dashboard = dashboards.get(sessionId);
    if (dashboard?.message) {
        const endEmbed = new EmbedBuilder()
            .setTitle("🏁 Group Pomodoro Completed!")
            .setDescription(`Congratulations everyone! 🎉\n\nYou've completed **${session.completedSessions}/${session.maxSessions}** study sessions together!\n\nAmazing teamwork and focus! 💪`)
            .setColor("Green")
            .addFields(
                {
                    name: "📊 Final Stats",
                    value: `**Sessions Completed:** ${session.completedSessions}\n**Participants:** ${session.participants.filter(p => p.isActive).length}`,
                    inline: true
                }
            )
            .setFooter({ text: `Session ID: ${sessionId}` })
            .setTimestamp();

        await dashboard.message.edit({ 
            embeds: [endEmbed], 
            components: [] 
        }).catch(() => {});
    }

    dashboards.delete(sessionId);
    console.log(`🏁 Group session completed: ${sessionId} (${session.completedSessions}/${session.maxSessions} sessions)`);
}

export async function handleGroupPhaseCompletion(sessionId, client) {
    const session = await GroupSession.findOne({ sessionId, isActive: true });
    if (!session) return;

    // Clear current timer
    const timer = activeGroupTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        activeGroupTimers.delete(sessionId);
    }

    const currentPhase = session.phase;
    const phaseNames = {
        study: "📚 Study Session",
        break: "☕ Short Break", 
        long_break: "🌴 Long Break"
    };

    console.log(`⏭️ Phase skipped: ${phaseNames[currentPhase]} in session ${sessionId}`);

    // If current phase is study, increment completed sessions (since it's being skipped/completed)
    if (session.phase === 'study') {
        const newCompletedSessions = session.completedSessions + 1;
        
        // Check if this was the last session
        if (newCompletedSessions >= session.maxSessions) {
            // Send notification about final session completion
            await sendSkipCompletionNotification(sessionId, currentPhase, newCompletedSessions, session.maxSessions, true, client);
            await endGroupSession(sessionId, client);
            return;
        }

        // Determine next phase after study
        let nextPhase;
        if (newCompletedSessions % session.sessionsBeforeLongBreak === 0) {
            nextPhase = 'long_break';
        } else {
            nextPhase = 'break';
        }

        await GroupSession.updateOne(
            { sessionId },
            { 
                phase: nextPhase,
                completedSessions: newCompletedSessions 
            }
        );

        // Send notification about study session completion and progress
        await sendSkipCompletionNotification(sessionId, currentPhase, newCompletedSessions, session.maxSessions, false, client);

        console.log(`✅ Study session ${newCompletedSessions} skipped - Moving to ${nextPhase}`);
    } else {
        // Break skipped - move to next study session
        await GroupSession.updateOne(
            { sessionId },
            { phase: 'study' }
        );

        // Send notification about break being skipped
        await sendSkipCompletionNotification(sessionId, currentPhase, session.completedSessions, session.maxSessions, false, client);

        console.log(`☕ Break skipped - Moving to next study session`);
    }

    // Start the next phase immediately
    runPhase(sessionId, client);
}

// Helper function to send skip completion notifications
async function sendSkipCompletionNotification(sessionId, skippedPhase, completedSessions, maxSessions, isSessionComplete, client) {
    const session = await GroupSession.findOne({ sessionId });
    if (!session) return;

    const activeParticipants = session.participants.filter(p => p.isActive);
    const participantMentions = activeParticipants.map(p => `<@${p.userId}>`).join(' ');
    
    const phaseNames = {
        study: "📚 Study Session",
        break: "☕ Short Break", 
        long_break: "🌴 Long Break"
    };

    let message;
    
    if (isSessionComplete) {
        message = `${participantMentions}\n\n🎉 **Final ${phaseNames[skippedPhase]}** completed!\n🏁 **Group session finished!** You completed all ${completedSessions}/${maxSessions} study sessions!`;
    } else if (skippedPhase === 'study') {
        const progressBar = buildProgressBar(completedSessions, maxSessions);
        message = `${participantMentions}\n\n✅ **${phaseNames[skippedPhase]}** completed!\n📊 Progress: \`${progressBar}\` (${completedSessions}/${maxSessions} sessions)`;
    } else {
        message = `${participantMentions}\n\n⏭️ **${phaseNames[skippedPhase]}** skipped!\n🔄 Ready for the next study session!`;
    }

    try {
        const channel = await client.channels.fetch(session.channelId);
        if (channel) {
            // Send the skip notification
            await channel.send(message);

            // If session is not complete, also send the timer embed for the new phase
            if (!isSessionComplete) {
                // Get the updated session to get the new phase info
                const updatedSession = await GroupSession.findOne({ sessionId });
                if (updatedSession && updatedSession.isActive) {
                    const newPhase = updatedSession.phase;
                    let duration;
                    
                    // Determine duration for the new phase
                    if (newPhase === 'study') {
                        duration = updatedSession.workDuration;
                    } else if (newPhase === 'break') {
                        duration = updatedSession.breakDuration;
                    } else if (newPhase === 'long_break') {
                        duration = updatedSession.longBreakDuration;
                    }

                    // Calculate end time for the new phase
                    const endTime = new Date(Date.now() + duration * 60 * 1000);
                    const endTimestamp = Math.floor(endTime.getTime() / 1000);
                    
                    // Create the timer embed for the new phase
                    const progressBar = buildProgressBar(updatedSession.completedSessions, updatedSession.maxSessions);
                    
                    const newPhaseNames = {
                        study: "📚 Focus Time",
                        break: "☕ Short Break",
                        long_break: "🌴 Long Break"
                    };

                    const phaseColors = {
                        study: 0x3498db,      // blue
                        break: 0xf1c40f,      // yellow
                        long_break: 0x2ecc71  // green
                    };

                    const embed = new EmbedBuilder()
                        .setTitle(`👥 Group Pomodoro — ${newPhaseNames[newPhase]}`)
                        .setDescription(
                            `⏳ Duration: **${duration} mins**\n` +
                            `🕒 **Ends <t:${endTimestamp}:R>** • <t:${endTimestamp}:T>\n\n` +
                            `📈 **Progress:**\n\`${progressBar}\``
                        )
                        .setColor(phaseColors[newPhase])
                        .setFooter({ 
                            text: `Session ${updatedSession.completedSessions}/${updatedSession.maxSessions} • ${sessionId}` 
                        })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`group_skip_${sessionId}`)
                            .setLabel("⏭️ Skip Phase")
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`group_end_${sessionId}`)
                            .setLabel("⛔ Stop Session")
                            .setStyle(ButtonStyle.Danger)
                    );

                    // Send the new phase timer embed
                    const newPhaseMessages = {
                        study: `🔥 **Focus time!** Time to concentrate and be productive!`,
                        break: `☕ **Break time!** Take a short rest and recharge!`,
                        long_break: `🌴 **Long break!** You've earned this extended rest!`
                    };

                    const timerMessage = `⏰ ${participantMentions} ${newPhaseMessages[newPhase]}`;
                    
                    const msg = await channel.send({ 
                        content: timerMessage, 
                        embeds: [embed], 
                        components: [row] 
                    });

                    // Update the dashboard to track the new message
                    dashboards.set(sessionId, { message: msg, channel: channel });
                    
                    // Update the session's actualEndTimestamp in the database
                    await GroupSession.updateOne(
                        { sessionId },
                        { actualEndTimestamp: endTime }
                    );
                }
            }
        }
    } catch (error) {
        console.error('❌ Error sending skip completion notification:', error);
    }
}
import { GroupSession } from "../models/GroupSession.js";
import { schedulePulseRefresh } from "../services/serverPulse/manager.js";
import { POMODORO_FALLBACK_CHANNEL_ID } from "../config/constants.js";
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

function canSend(channel, guild) {
    return !!channel?.isTextBased?.() &&
        !!channel.permissionsFor(guild.members.me)?.has(["SendMessages", "ViewChannel"]);
}

// Group sessions broadcast one shared message to every participant, so
// unlike solo sessions there's no single user's voice channel to "follow" —
// this only adds a safety net for when the lobby channel itself is gone
// (e.g. a temporary voice channel deleted after everyone left it), in
// priority order: the lobby channel → the configured fallback channel →
// the guild's system channel, as a last resort.
async function resolveGroupChannel(session, client) {
    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) return null;

    const lobbyChannel = guild.channels.cache.get(session.channelId)
        ?? await guild.channels.fetch(session.channelId).catch(() => null);
    if (canSend(lobbyChannel, guild)) return lobbyChannel;

    if (POMODORO_FALLBACK_CHANNEL_ID) {
        const fallbackChannel = guild.channels.cache.get(POMODORO_FALLBACK_CHANNEL_ID)
            ?? await guild.channels.fetch(POMODORO_FALLBACK_CHANNEL_ID).catch(() => null);
        if (canSend(fallbackChannel, guild)) return fallbackChannel;
    }

    const systemChannel = guild.systemChannel
        || guild.channels.cache.find((ch) => ch.isTextBased() && ch.viewable);
    return canSend(systemChannel, guild) ? systemChannel : null;
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

// Called once on bot boot: re-arms a timer for every group session left
// `status: 'active'` from before the restart, using actualEndTimeStamp
// instead of the full phase duration. Without this, a restart silently
// orphans every running group session — and unlike solo Sessions, GroupSession
// has no TTL at all for `active` docs (only `completed` ones expire), so a
// stuck session sits in the DB forever until a participant notices and
// manually runs /pomodoro group end or leave.
// Same known limitation as resumeAllActiveSessions: only catches up one
// phase boundary per session on boot, not an exact multi-phase replay.
export async function resumeAllActiveGroupSessions(client) {
    const sessions = await GroupSession.find({ status: "active" });
    console.log(`🔁 Resuming ${sessions.length} active group Pomodoro session(s) after restart`);

    for (const session of sessions) {
        const { sessionId } = session;

        const existingTimer = activeGroupTimers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            activeGroupTimers.delete(sessionId);
        }

        const remainingMs = session.actualEndTimeStamp
            ? session.actualEndTimeStamp.getTime() - Date.now()
            : 0;

        const timerId = setTimeout(() => {
            activeGroupTimers.delete(sessionId);
            handlePhaseCompletion(sessionId, client);
        }, Math.max(0, remainingMs));

        activeGroupTimers.set(sessionId, timerId);
    }
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
            actualEndTimeStamp: endTime
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
    schedulePulseRefresh(session.guildId, client);
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
            await GroupSession.updateOne({ sessionId }, { completedSessions: newCompletedSessions });
            await sendPhaseCompletionNotification(sessionId, phase, null, newCompletedSessions, client);
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

    schedulePulseRefresh(session.guildId, client);

    // Send phase completion notification to users
    await sendPhaseCompletionNotification(sessionId, phase, nextPhase, shouldIncrementSession ? completedSessions + 1 : completedSessions, client);

    // Continue to next phase
    runPhase(sessionId, client);
}

// Helper function to send phase completion notifications (for natural transitions)
async function sendPhaseCompletionNotification(sessionId, completedPhase, nextPhase, currentCompletedSessions, client) {
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
    
    if (nextPhase === null && completedPhase === 'study') {
        // Final study session completed — group session finished
        message = `${participantMentions}\n\n🎉 **Final ${phaseNames[completedPhase]}** completed!\n🏁 **Group session finished!**  ${currentCompletedSessions}/${session.maxSessions}`;
    } else if (completedPhase === 'study') {
        // Study session completed
        const progressBar = buildProgressBar(currentCompletedSessions, session.maxSessions);
        message = `${participantMentions}\n\n✅ **${phaseNames[completedPhase]}** completed!\n📊 Progress: \`${progressBar}\` (${currentCompletedSessions}/${session.maxSessions} sessions)`;
    } else {
        // Break completed
        message = `${participantMentions}\n\n✅ **${phaseNames[completedPhase]}** completed!\n🔄 Time for the next phase!`;
    }

    try {
        const channel = await resolveGroupChannel(session, client);
        if (channel) {
            await channel.send(message);
        } else {
            console.error(`❌ No deliverable channel for phase completion notification: ${sessionId}`);
        }
    } catch (error) {
        console.error('❌ Error sending phase completion notification:', error);
    }
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

    try {
        const targetChannel = await resolveGroupChannel(session, client);

        if (targetChannel) {
            const participantMentions = userIds.map(id => `<@${id}>`).join(' ');

            const phaseMessages = {
                study: `🔥 **Focus time!** Time to concentrate and be productive!`,
                break: `☕ **Break time!** Take a short rest and recharge!`,
                long_break: `🌴 **Long break!** You've earned this extended rest!`
            };

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

    schedulePulseRefresh(session.guildId, client);

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
            .setDescription(`Congratulations everyone! \n\nYou've completed **${session.completedSessions}/${session.maxSessions}** study sessions together!\n\nAmazing teamwork and focus! `)
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
        message = `${participantMentions}\n\n🎉 **Final ${phaseNames[skippedPhase]}** completed!\n🏁 **Group session finished!**  ${completedSessions}/${maxSessions}`;
    } else if (skippedPhase === 'study') {
        const progressBar = buildProgressBar(completedSessions, maxSessions);
        message = `${participantMentions}\n\n **${phaseNames[skippedPhase]}** completed!\n📊 Progress: \`${progressBar}\` (${completedSessions}/${maxSessions} sessions)`;
    } else {
        message = `${participantMentions}\n\n⏭️ **${phaseNames[skippedPhase]}** skipped!\n Ready for the next study session!`;
    }

    try {
        const channel = await resolveGroupChannel(session, client);
        if (channel) {
            await channel.send(message);
        } else {
            console.error(`❌ No deliverable channel for skip completion notification: ${sessionId}`);
        }
    } catch (error) {
        console.error('❌ Error sending skip completion notification:', error);
    }
}
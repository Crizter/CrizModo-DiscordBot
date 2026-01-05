// import { GroupSession } from "../../../models/GroupSession.js";
import { GroupSession } from "../../../models/GroupSession.js";
import { 
    hasActiveSession, 
    addParticipant, 
    removeParticipant, 
    isHost 
} from "../../../utils/groupPomodoroManager.js";
import { getGroupSessionEmbed } from "../../../utils/getGroupSessionEmbed.js";
// Import your existing timer system instead of the new one
import { startGroupPomodoroLoop } from "../../../utils/startGroupPomodoroLoop.js";

export async function handleGroupButtonInteraction(interaction, client) {
    const [action, sessionId] = interaction.customId.replace('group_', '').split('_');
    const userId = interaction.user.id;

    try {
        // Find the session
        const groupSession = await GroupSession.findOne({ 
            sessionId, 
            status: { $in: ['waiting', 'active'] } 
        });

        if (!groupSession) {
            return await interaction.reply({
                content: "❌ Session not found or no longer available.",
                flags: 64
            });
        }

        switch (action) {
            case 'join':
                await handleJoinButton(interaction, groupSession, userId, client);
                break;
            case 'start':
                await handleStartButton(interaction, groupSession, userId, client);
                break;
            case 'leave':
                await handleLeaveButton(interaction, groupSession, userId, client);
                break;
            case 'end':
                await handleEndButton(interaction, groupSession, userId, client);
                break;
            case 'skip':
                await handleSkipButton(interaction, groupSession, userId, client);
                break;
            default:
                await interaction.reply({
                    content: "❌ Unknown action.",
                    flags: 64
                });
        }
    } catch (error) {
        console.error("❌ Error handling group button interaction:", error);
        await interaction.reply({
            content: "❌ An error occurred. Please try again.",
            flags: 64
        });
    }
}

async function handleJoinButton(interaction, groupSession, userId, client) {
    // Check if user already has an active session
    const existingSession = await hasActiveSession(userId);
    if (existingSession) {
        return await interaction.reply({
            content: `❌ You already have an active ${existingSession.type} session.`,
            flags: 64
        });
    }

    try {
        await addParticipant(groupSession.sessionId, userId);
        const updatedSession = await GroupSession.findOne({ sessionId: groupSession.sessionId });
        const { embed, components } = await getGroupSessionEmbed(updatedSession);

        await interaction.update({
            embeds: [embed],
            components
        });

    } catch (error) {
        if (error.message === 'Already in this session') {
            await interaction.reply({
                content: "❌ You're already in this session.",
                flags: 64
            });
        } else if (error.message === 'Session is full') {
            await interaction.reply({
                content: "❌ This session is full.",
                flags: 64
            });
        } else {
            throw error;
        }
    }
}

async function handleStartButton(interaction, groupSession, userId, client) {
    // Check if user is the host
    if (!isHost(groupSession, userId)) {
        return await interaction.reply({
            content: "❌ Only the host can start the session.",
            flags: 64
        });
    }

    if (groupSession.status !== 'waiting') {
        return await interaction.reply({
            content: "❌ Session is already active or completed.",
            flags: 64
        });
    }

    // Check if there are participants
    const activeParticipants = groupSession.participants.filter(p => p.isActive);
    if (activeParticipants.length === 0) {
        return await interaction.reply({
            content: "❌ No participants in the session.",
            flags: 64
        });
    }

    try {
        // Start the session using your existing timer system
        await GroupSession.updateOne(
            { sessionId: groupSession.sessionId },
            { 
                status: 'active',
                startTime: new Date(),
                isActive: true  // Make sure this matches your existing schema
            }
        );

        const updatedSession = await GroupSession.findOne({ sessionId: groupSession.sessionId });
        const { embed, components } = await getGroupSessionEmbed(updatedSession);

        await interaction.update({
            embeds: [embed],
            components
        });

        // Use your existing timer system - pass the sessionId as groupId
        console.log(`🚀 Starting group session with existing timer system: ${groupSession.sessionId}`);
        startGroupPomodoroLoop(groupSession.sessionId, client);

        console.log(`🚀 Group session started: ${groupSession.sessionId} by host ${userId}`);

    } catch (error) {
        console.error("❌ Error starting group session:", error);
        await interaction.reply({
            content: "❌ Failed to start the session. Please try again.",
            flags: 64
        });
    }
}

async function handleLeaveButton(interaction, groupSession, userId, client) {
    try {
        const updatedSession = await removeParticipant(groupSession.sessionId, userId);
        
        if (updatedSession.status === 'completed') {
            await interaction.reply({
                content: "👋 You have left the session. Since you were the host, the session has ended.",
                flags: 64
            });
            
            // Update the message to show session ended
            const { embed } = await getGroupSessionEmbed(updatedSession);
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
        } else {
            const { embed, components } = await getGroupSessionEmbed(updatedSession);
            
            await interaction.update({
                embeds: [embed],
                components
            });
            
            await interaction.followUp({
                content: "👋 You have left the group session.",
                flags: 64
            });
        }
    } catch (error) {
        console.error("❌ Error leaving session:", error);
        await interaction.reply({
            content: "❌ Failed to leave session. Please try again.",
            flags: 64
        });
    }
}

async function handleEndButton(interaction, groupSession, userId, client) {
    // Check if user is the host
    if (!isHost(groupSession, userId)) {
        return await interaction.reply({
            content: "❌ Only the host can end the session.",
            flags: 64
        });
    }

    try {
        // End the session
        await GroupSession.updateOne(
            { sessionId: groupSession.sessionId },
            { 
                status: 'completed',
                isActive: false  // Make sure this matches your existing schema
            }
        );

        const completedSession = await GroupSession.findOne({ sessionId: groupSession.sessionId });
        const { embed } = await getGroupSessionEmbed(completedSession);

        await interaction.update({
            embeds: [embed],
            components: []
        });

        console.log(`🏁 Group session ended by host: ${groupSession.sessionId}`);

    } catch (error) {
        console.error("❌ Error ending session:", error);
        await interaction.reply({
            content: "❌ Failed to end session. Please try again.",
            flags: 64
        });
    }
}

async function handleSkipButton(interaction, groupSession, userId, client) {
    // Check if user is the host
    if (!isHost(groupSession, userId)) {
        return await interaction.reply({
            content: "❌ Only the host can skip phases.",
            flags: 64
        });
    }

    if (groupSession.status !== 'active') {
        return await interaction.reply({
            content: "❌ Session is not active.",
            flags: 64
        });
    }

    // Get current phase before skipping
    const currentPhase = groupSession.phase;
    
    // Phase name mapping for user-friendly messages
    const phaseNames = {
        study: "📚 Study Session",
        break: "☕ Short Break", 
        long_break: "🌴 Long Break"
    };

    const phaseName = phaseNames[currentPhase] || currentPhase;

    await interaction.reply({
        content: `⏭️ **${phaseName}** skipped by host! Moving to next phase...`,
        flags: 64
    });

    // Import and call the skip functionality
    const { handleGroupPhaseCompletion } = await import("../../../utils/startGroupPomodoroLoop.js");
    
    // Notify all active participants about the skip
    const activeParticipants = groupSession.participants.filter(p => p.isActive);
    const participantMentions = activeParticipants.map(p => `<@${p.userId}>`).join(' ');
    
    // Send notification to the channel
    try {
        const channel = await client.channels.fetch(groupSession.channelId);
        if (channel) {
            const skipMessage = `${participantMentions}\n\n⏭️ **${phaseName}** has been skipped by the host!\n🔄 Moving to the next phase...`;
            await channel.send(skipMessage);
        }
    } catch (error) {
        console.error('❌ Error sending skip notification:', error);
    }

    // Execute the skip
    await handleGroupPhaseCompletion(groupSession.sessionId, client);
    
    console.log(`⏭️ ${phaseName} skipped for group session: ${groupSession.sessionId}`);
}
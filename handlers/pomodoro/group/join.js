import { addParticipant, hasActiveSession } from "../../../utils/groupPomodoroManager.js";
import { GroupSession } from "../../../models/GroupSession.js";
import { getGroupSessionEmbed } from "../../../utils/getGroupSessionEmbed.js";

export async function handleGroupJoin(interaction, client) {
    const userId = interaction.user.id;
    const sessionId = interaction.options.getString("session-id").toUpperCase();

    try {
        // Check if user already has an active session
        const existingSession = await hasActiveSession(userId);
        if (existingSession) {
            return await interaction.reply({
                content: `❌ You already have an active ${existingSession.type} session. End it first before joining a group session.`,
                flags: 64
            });
        }

        // Find the session
        const groupSession = await GroupSession.findOne({ 
            sessionId, 
            status: { $in: ['waiting', 'active'] } 
        });

        if (!groupSession) {
            return await interaction.reply({
                content: `❌ Session \`${sessionId}\` not found or no longer available.`,
                flags: 64
            });
        }

        // Check if session is in the same guild
        if (groupSession.guildId !== interaction.guildId) {
            return await interaction.reply({
                content: `❌ That session is not available in this server.`,
                flags: 64
            });
        }

        // Add participant to session
        await addParticipant(sessionId, userId);

        // Get updated session
        const updatedSession = await GroupSession.findOne({ sessionId });
        const { embed, components } = await getGroupSessionEmbed(updatedSession);

        // Update the original message in the channel
        try {
            const channel = await client.channels.fetch(groupSession.channelId);
            if (channel) {
                // Find recent messages from bot with this session ID
                const messages = await channel.messages.fetch({ limit: 10 });
                const sessionMessage = messages.find(msg => 
                    msg.author.id === client.user.id && 
                    msg.content.includes(sessionId)
                );

                if (sessionMessage) {
                    await sessionMessage.edit({
                        embeds: [embed],
                        components
                    });
                }
            }
        } catch (updateError) {
            console.log("Failed to update session message:", updateError.message);
        }

        await interaction.reply({
            content: `✅ Successfully joined group session \`${sessionId}\`! ${updatedSession.status === 'waiting' ? 'Waiting for host to start the session.' : ''}`,
            flags: 64
        });

        console.log(`👥 User ${userId} joined group session ${sessionId}`);

    } catch (error) {
        console.error("❌ Error joining group session:", error);
        
        if (error.message === 'Already in this session') {
            await interaction.reply({
                content: "❌ You're already in this session.",
                flags: 64
            });
        } else if (error.message === 'Session is full') {
            await interaction.reply({
                content: "❌ This session is full. Maximum participants reached.",
                flags: 64
            });
        } else {
            await interaction.reply({
                content: "❌ Failed to join group session. Please try again.",
                flags: 64
            });
        }
    }
}
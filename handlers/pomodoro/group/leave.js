import { removeParticipant, getUserGroupSession } from "../../../utils/groupPomodoroManager.js";
import { getGroupSessionEmbed } from "../../../utils/getGroupSessionEmbed.js";
import { GroupSession } from "../../../models/GroupSession.js";

export async function handleGroupLeave(interaction, client) {
    const userId = interaction.user.id;

    try {
        // Find user's group session
        const groupSession = await getUserGroupSession(userId);
        if (!groupSession) {
            return await interaction.reply({
                content: "❌ You're not in any group session.",
                flags: 64
            });
        }

        // Remove participant from session
        const updatedSession = await removeParticipant(groupSession.sessionId, userId);

        // If session was ended (host left)
        if (updatedSession.status === 'completed') {
            await interaction.reply({
                content: "🏁 You have left the group session. Since you were the host, the session has been ended.",
                flags: 64
            });

            // Notify remaining participants
            try {
                const channel = await client.channels.fetch(groupSession.channelId);
                if (channel) {
                    const remainingParticipants = groupSession.participants
                        .filter(p => p.isActive && p.userId !== userId)
                        .map(p => `<@${p.userId}>`)
                        .join(' ');

                    if (remainingParticipants) {
                        await channel.send(`📢 ${remainingParticipants}\n\n🏁 The group session has ended because the host left.`);
                    }
                }
            } catch (notifyError) {
                console.log("Failed to notify participants:", notifyError.message);
            }

            console.log(`🏁 Group session ${groupSession.sessionId} ended - host left`);
            return;
        }

        // Update the session message
        try {
            const channel = await client.channels.fetch(groupSession.channelId);
            if (channel) {
                const { embed, components } = await getGroupSessionEmbed(updatedSession);
                
                const messages = await channel.messages.fetch({ limit: 10 });
                const sessionMessage = messages.find(msg => 
                    msg.author.id === client.user.id && 
                    msg.content.includes(groupSession.sessionId)
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
            content: "👋 You have left the group session.",
            flags: 64
        });

        console.log(`👋 User ${userId} left group session ${groupSession.sessionId}`);

    } catch (error) {
        console.error("❌ Error leaving group session:", error);
        await interaction.reply({
            content: "❌ Failed to leave group session. Please try again.",
            flags: 64
        });
    }
}
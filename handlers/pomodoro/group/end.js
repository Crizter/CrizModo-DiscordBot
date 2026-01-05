import { getUserGroupSession, isHost } from "../../../utils/groupPomodoroManager.js";
import { GroupSession } from "../../../models/GroupSession.js";
import { activeGroupTimers } from "../../../utils/startGroupPomodoroLoop.js";

export async function handleGroupEnd(interaction, client) {
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

        // Check if user is the host
        if (!isHost(groupSession, userId)) {
            return await interaction.reply({
                content: "❌ Only the session host can end the session.",
                flags: 64
            });
        }

        // End the session
        await GroupSession.updateOne(
            { sessionId: groupSession.sessionId },
            { status: 'completed' }
        );

        // Clear any active timer
        const timer = activeGroupTimers.get(groupSession.sessionId);
        if (timer) {
            clearTimeout(timer);
            activeGroupTimers.delete(groupSession.sessionId);
        }

        // Notify all participants
        const activeParticipants = groupSession.participants
            .filter(p => p.isActive && p.userId !== userId)
            .map(p => `<@${p.userId}>`)
            .join(' ');

        let responseMessage = "🏁 Group session ended successfully.";
        
        if (activeParticipants) {
            try {
                const channel = await client.channels.fetch(groupSession.channelId);
                if (channel) {
                    await channel.send(`📢 ${activeParticipants}\n\n🏁 The group session has been ended by the host.`);
                }
            } catch (notifyError) {
                console.log("Failed to notify participants:", notifyError.message);
            }
        }

        await interaction.reply({
            content: responseMessage,
            flags: 64
        });

        console.log(`🏁 Group session ${groupSession.sessionId} ended by host ${userId}`);

    } catch (error) {
        console.error("❌ Error ending group session:", error);
        await interaction.reply({
            content: "❌ Failed to end group session. Please try again.",
            flags: 64
        });
    }
}
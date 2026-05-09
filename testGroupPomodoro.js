import "dotenv/config";
import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";

const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID) {
    console.error("Usage: node testGroupPomodoro.js <channelId>");
    process.exit(1);
}

const PHASE_SECONDS = 10;
const SESSION_ID = "TEST01";

const PARTICIPANT_IDS = [
    "513687798587457537",
    "1072491128311521310",
    "228537642583588864",
    "159985870458322944",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildProgressBar(completed, max) {
    return "█".repeat(completed) + "░".repeat(max - completed);
}

const phaseNames = {
    study: "📚 Focus Time",
    break: "☕ Short Break",
    long_break: "🌴 Long Break",
};

const phaseColors = {
    study: 0x3498db,
    break: 0xf1c40f,
    long_break: 0x2ecc71,
};

const completedPhaseNames = {
    study: "📚 Study Session",
    break: "☕ Short Break",
    long_break: "🌴 Long Break",
};

const phaseMessages = {
    study: `🔥 **Focus time!** Time to concentrate and be productive!`,
    break: `☕ **Break time!** Take a short rest and recharge!`,
    long_break: `🌴 **Long break!** You've earned this extended rest!`,
};

function buildPhaseEmbed(phase, completedSessions, maxSessions) {
    const endTime = new Date(Date.now() + PHASE_SECONDS * 1000);
    const endTimestamp = Math.floor(endTime.getTime() / 1000);
    const progressBar = buildProgressBar(completedSessions, maxSessions);

    return new EmbedBuilder()
        .setTitle(`👥 Group Pomodoro — ${phaseNames[phase]}`)
        .setDescription(
            `⏳ Duration: **${PHASE_SECONDS} seconds** (test mode)\n` +
                `🕒 **Ends <t:${endTimestamp}:R>** • <t:${endTimestamp}:T>\n\n` +
                `📈 **Progress:**\n\`${progressBar}\``
        )
        .setColor(phaseColors[phase])
        .setFooter({
            text: `Session ${completedSessions}/${maxSessions} • ${SESSION_ID}`,
        })
        .setTimestamp();
}

function buildRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`group_skip_${SESSION_ID}`)
            .setLabel("⏭️ Skip Phase")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`group_end_${SESSION_ID}`)
            .setLabel("⛔ Stop Session")
            .setStyle(ButtonStyle.Danger)
    );
}

async function sendPhaseStart(channel, phase, completedSessions, maxSessions, mentions) {
    const embed = buildPhaseEmbed(phase, completedSessions, maxSessions);
    const row = buildRow();
    const content = `⏰ ${mentions} ${phaseMessages[phase]}`;
    await channel.send({ content, embeds: [embed], components: [row] });
    console.log(`▶️  Sent ${phase} phase start (${completedSessions}/${maxSessions})`);
}

async function sendPhaseComplete(channel, phase, completedSessions, maxSessions, mentions) {
    let content;
    if (phase === "study") {
        const progressBar = buildProgressBar(completedSessions, maxSessions);
        content = `${mentions}\n\n✅ **${completedPhaseNames[phase]}** completed!\n📊 Progress: \`${progressBar}\` (${completedSessions}/${maxSessions} sessions)`;
    } else {
        content = `${mentions}\n\n✅ **${completedPhaseNames[phase]}** completed!\n🔄 Time for the next phase!`;
    }
    await channel.send(content);
    console.log(`✅ Sent ${phase} completion announcement`);
}

async function runTest() {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    await client.login(process.env.TOKEN);
    await new Promise((resolve) => client.once("ready", resolve));
    console.log(`✅ Logged in as ${client.user.tag}`);

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
        console.error(`❌ Channel ${CHANNEL_ID} not found`);
        process.exit(1);
    }
    console.log(`📍 Posting to #${channel.name} in ${channel.guild?.name ?? "unknown guild"}`);

    const mentions = PARTICIPANT_IDS.map((id) => `<@${id}>`).join(" ");

    const sequence = [
        { phase: "study", completedAfter: 1 },
        { phase: "break", completedAfter: 1 },
        { phase: "study", completedAfter: 2 },
        { phase: "long_break", completedAfter: 2 },
        { phase: "study", completedAfter: 3 },
    ];
    const maxSessions = 3;

    let completedSessions = 0;
    await sendPhaseStart(channel, sequence[0].phase, completedSessions, maxSessions, mentions);

    for (let i = 0; i < sequence.length; i++) {
        await sleep(PHASE_SECONDS * 1000);
        const current = sequence[i];
        completedSessions = current.completedAfter;

        await sendPhaseComplete(
            channel,
            current.phase,
            completedSessions,
            maxSessions,
            mentions
        );

        const next = sequence[i + 1];
        if (next) {
            await sendPhaseStart(
                channel,
                next.phase,
                next.phase === "study" ? completedSessions : completedSessions,
                maxSessions,
                mentions
            );
        }
    }

    const endEmbed = new EmbedBuilder()
        .setTitle("🏁 Group Pomodoro Completed! (TEST)")
        .setDescription(
            `Test run finished — completed ${completedSessions}/${maxSessions} simulated sessions.`
        )
        .setColor("Green")
        .setFooter({ text: `Session ID: ${SESSION_ID}` })
        .setTimestamp();
    await channel.send({ embeds: [endEmbed] });
    console.log(`🏁 Test complete`);

    await client.destroy();
    process.exit(0);
}

runTest().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});

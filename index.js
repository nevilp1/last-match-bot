require('dotenv').config();
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');

const fs = require('fs-extra');

const ALIAS_FILE = './aliases.json';

function loadAliases() {
  return fs.existsSync(ALIAS_FILE)
    ? fs.readJsonSync(ALIAS_FILE)
    : {};
}

function saveAliases(data) {
  fs.writeJsonSync(ALIAS_FILE, data, { spaces: 2 });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('register')) {
        const args = message.content.split(' ');
        const alias = args[1];
        const accountId = args[2];

        if (!alias || !accountId) {
            return message.reply('Usage: register <alias> <account_id>');
        }

        const aliases = loadAliases();
        aliases[alias.toLowerCase()] = accountId;
        saveAliases(aliases);

        return message.reply(`Registered **${alias}** → ${accountId}`);
    }
    if (message.content.startsWith('lastmatch')) {
        const args = message.content.split(' ');
        const input = args[1];
        const aliases = loadAliases();
        const accountId = aliases[input?.toLowerCase()] || input;

        if (!accountId) {
            return message.reply('Usage: lastmatch <account_id>');
        }

        try {
            const profileRes = await axios.get(
            `https://api.opendota.com/api/players/${accountId}`
            );

            const playerName =
            profileRes.data.profile?.personaname || 'Unknown Player';
            // Fetch recent match
            const matchRes = await axios.get(
            `https://api.opendota.com/api/players/${accountId}/recentMatches`
            );

            const lastMatch = matchRes.data[0];
            if (!lastMatch) return message.reply('No recent match found.');

            // Fetch hero list
            const heroesRes = await axios.get(
            'https://api.opendota.com/api/heroes'
            );

            const hero = heroesRes.data.find(h => h.id === lastMatch.hero_id);
            const heroName = hero ? hero.localized_name : `Hero ID ${lastMatch.hero_id}`;

            // Win/Lose
            const result =
                lastMatch.radiant_win === (lastMatch.player_slot < 128)
                ? 'Win 🟢'
                : 'Lose 🔴';

            // Time formatting
            const startTime = new Date(lastMatch.start_time * 1000);
            const now = new Date();

            const diffMs = now - startTime;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

            let timeAgo = '';
            if (days > 0) timeAgo += `${days}d `;
            if (hours > 0) timeAgo += `${hours}h `;
            timeAgo += `${minutes}m ago`;
            const durationMinutes = Math.floor(lastMatch.duration / 60);
            const durationSeconds = lastMatch.duration % 60;
            const formattedDuration = `${durationMinutes}:${durationSeconds
            .toString()
            .padStart(2, '0')}`;

            message.reply([
            '🎮 **Last Match Info**',
            `Player: ${accountId}`,
            `Nickname: ${playerName}`,
            `Hero: ${heroName}`,
            `K/D/A: ${lastMatch.kills}/${lastMatch.deaths}/${lastMatch.assists}`,
            `Result: ${result}`,
            `Duration: ${formattedDuration}`,
            `Played: ${startTime.toLocaleString('id-ID')} (${timeAgo})`
            ].join('\n'));

        } catch (error) {
            console.error(error.message);
            message.reply('Failed to fetch match info.');
        }
    }
    if (message.content === 'helpdota') {
        return message.reply([
            '📖 **Bot Commands**',
            '',
            'helpdota',
            'Show this help menu',
            '',
            'register <alias> <account_id>',
            'Register an alias for a Steam/OpenDota account',
            'Example: register me 123456789',
            '',
            'lastmatch <alias/account_id>',
            'Show the latest Dota 2 match info',
            'Examples:',
            'lastmatch me',
            'lastmatch 123456789',
            '',
            'listaliases',
            'Show all registered aliases'
        ].join('\n'));
    }
    if (message.content === 'account') {
    return message.reply([
        '🔐 **Account Info**',
        `ACCOUNT ID: ${process.env.ACCOUNT_ID}`,
        `PASSWORD: ${process.env.ACCOUNT_PASSWORD}`
    ].join('\n'));
    }
    if (message.content === 'listaliases') {
        const aliases = loadAliases();

        if (Object.keys(aliases).length === 0) {
            return message.reply('No aliases registered.');
        }

        const aliasList = Object.entries(aliases)
            .map(([alias, id]) => `${alias} → ${id}`)
            .join('\n');

        return message.reply([
            '📋 **Registered Aliases**',
            aliasList
        ].join('\n'));
    }
});

client.login(process.env.TOKEN);
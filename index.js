import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';

// Force IPv4 resolution
dns.setDefaultResultOrder('ipv4first');

// Extend default timeout from 10s to 30s for native fetch
setGlobalDispatcher(new Agent({
  connect: {
    timeout: 30000
  }
}));

import 'dotenv/config';
// ... rest of your index.js code

import 'dotenv/config';
import axios from 'axios';
import { pool } from './connection.js';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import {
    getAccountIdByAlias, getDailyHeroWin, getMatchesForDailyHeroWin,
    removeAlias, saveAliases, resolveHero,
    getItemImage, getItems, getItem,
    getHeroStats,
    formatStreak
} from './utils.js';
import { generateItemRow } from './canvas.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- REGISTER ALIAS ---
    if (message.content.startsWith('register')) {
        const args = message.content.split(' ');
        const alias = args[1];
        const accountId = args[2];

        if (!alias || !accountId) {
            return message.reply('Usage: register <alias> <account_id>');
        }

        await saveAliases(message.author.id, accountId, alias);
        return message.reply(`Registered **${alias}** → ${accountId}`);
    }

    // --- REMOVE ALIAS ---
    if (message.content.startsWith('remove')) {
        const args = message.content.split(' ');
        const alias = args[1];

        if (!alias) {
            return message.reply('Usage: remove <alias>');
        }

        const error = await removeAlias(alias);

        if (error) {
            console.error(error.message);
            return message.reply('Failed to remove alias.');
        }

        return message.reply(`Removed alias **${alias}**`);
    }

    // --- LAST MATCH INFO ---
    if (message.content.startsWith('lastmatch')) {
        const args = message.content.split(' ');
        const input = args[1];

        let accountId = input;

        const aliasLookup = await getAccountIdByAlias(input?.toLowerCase());
        if (aliasLookup) accountId = aliasLookup;

        if (!accountId) {
            return message.reply('Usage: lastmatch <alias/account_id>');
        }

        try {
            const profileRes = await axios.get(
                `https://api.opendota.com/api/players/${accountId}`,
                { timeout: 15000 }
            );

            const playerName = profileRes.data.profile?.personaname || 'Unknown Player';

            // Fetch recent match
            const matchRes = await axios.get(
                `https://api.opendota.com/api/players/${accountId}/recentMatches`,
                { timeout: 15000 }
            );

            const lastMatch = matchRes.data[0];
            if (!lastMatch) return message.reply('No recent match found.');

            // Fixed: Removed the trailing period '.' in the URL
            const detailRes = await axios.get(
                `https://api.opendota.com/api/matches/${lastMatch.match_id}`,
                { timeout: 15000 }
            );

            const detailMatch = detailRes.data.players.find(p => Number(p.account_id) === Number(accountId));

            // Fetch hero list
            const heroesRes = await axios.get(
                'https://api.opendota.com/api/heroes',
                { timeout: 15000 }
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
            const gpm = lastMatch.gold_per_min || 'N/A';
            const xpm = lastMatch.xp_per_min || 'N/A';

            let timeAgo = '';
            if (days > 0) timeAgo += `${days}d `;
            if (hours > 0) timeAgo += `${hours}h `;
            timeAgo += `${minutes}m ago`;

            const durationMinutes = Math.floor(lastMatch.duration / 60);
            const durationSeconds = lastMatch.duration % 60;
            const formattedDuration = `${durationMinutes}:${durationSeconds
                .toString()
                .padStart(2, '0')}`;

            // Item Canvas
            const itemIds = [
                detailMatch.item_0,
                detailMatch.item_1,
                detailMatch.item_2,
                detailMatch.item_3,
                detailMatch.item_4,
                detailMatch.item_5
            ];

            const itemsData = await getItems();
            const items = itemIds.map(id => getItem(id, itemsData));

            // Do NOT filter out Boolean here so array maintains length of 6 slots!
            const itemImages = items.map(item => getItemImage(item));

            const buffer = await generateItemRow(itemImages);

            const embed = new EmbedBuilder()
                .setTitle('🎮 Last Match Info')
                .addFields(
                    { name: 'Player', value: `${accountId}`, inline: true },
                    { name: 'Nickname', value: playerName, inline: true },
                    { name: 'Hero', value: heroName, inline: true },

                    { name: 'K/D/A', value: `${lastMatch.kills}/${lastMatch.deaths}/${lastMatch.assists}`, inline: true },
                    { name: 'Result', value: result, inline: true },
                    { name: 'Duration', value: formattedDuration, inline: true },

                    { name: 'GPM', value: `${gpm}`, inline: true },
                    { name: 'XPM', value: `${xpm}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },

                    { name: 'Played', value: `${startTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB (${timeAgo})` }
                )
                .setColor(result.includes('Win') ? 0x00ff00 : 0xff0000)
                .setImage('attachment://items.png');

            await message.reply({
                embeds: [embed],
                files: [{
                    attachment: buffer,
                    name: 'items.png'
                }]
            });

        } catch (error) {
            if (error.response?.status === 404) {
                return message.reply('Steam ID not found.');
            }
            console.error(error);
            return message.reply('Failed to fetch match info.');
        }
    }

    // --- HELP COMMAND ---
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

    // --- DAILY HERO WIN ---
    if (message.content.startsWith('daily')) {
        const args = message.content.split(' ');
        const command = args[0]; // e.g. dailyta
        const heroAlias = command.replace('daily', '');

        if (!heroAlias || !args[1]) {
            return message.reply('Usage: daily[hero] [alias/account_id]');
        }

        let accountId = args[1];

        // Clean helper reuse instead of direct pool query
        const aliasLookup = await getAccountIdByAlias(accountId.toLowerCase());
        if (aliasLookup) accountId = aliasLookup;

        const hero = resolveHero(heroAlias);
        if (!hero) {
            return message.reply(`Unknown hero: ${heroAlias}`);
        }

        const matches = await getMatchesForDailyHeroWin(accountId, hero.id);
        const tracker = getDailyHeroWin(matches, hero.name);

        return message.reply(tracker);
    }

    // --- ACCOUNT INFO ---
    if (message.content === 'account') {
        return message.reply([
            '🔐 **Account Info**',
            `ACCOUNT ID: ${process.env.ACCOUNT_ID}`,
            `PASSWORD: ${process.env.ACCOUNT_PASSWORD}`
        ].join('\n'));
    }

    // --- LIST ALIASES ---
    if (message.content === 'listaliases') {
        try {
            const result = await pool.query('SELECT alias, account_id FROM aliases ORDER BY alias ASC');
            
            if (result.rows.length === 0) {
                return message.reply('No aliases registered.');
            }

            const aliasList = result.rows
                .map(row => `${row.alias} → ${row.account_id}`)
                .join('\n');

            return message.reply([
                '📋 **Registered Aliases**',
                aliasList
            ].join('\n'));

        } catch (err) {
            console.error("Failed to fetch aliases:", err);
            return message.reply('Failed to retrieve aliases from database.');
        }
    }

    // --- WINRATE & HERO STATS ---
    if (message.content.startsWith('wr')) {
        const args = message.content.split(' ');
        const command = args[0]; // e.g. wrjug
        const heroAlias = command.replace('wr', '');

        if (!heroAlias || !args[1]) {
            return message.reply('Usage: wr[hero] [alias/account_id]');
        }

        let accountId = args[1];

        // Clean helper reuse instead of direct pool query
        const aliasLookup = await getAccountIdByAlias(accountId.toLowerCase());
        if (aliasLookup) accountId = aliasLookup;

        const hero = resolveHero(heroAlias);
        if (!hero) {
            return message.reply(`Unknown hero: ${heroAlias}`);
        }

        const stats = await getHeroStats(accountId, hero.id);

        if (!stats) {
            return message.reply('No matches found.');
        }

        const streakType = stats.currentStreak.charAt(0);
        const streakCount = stats.currentStreak.slice(1);

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${hero.name} Stats`)
            .addFields(
                { name: 'Player', value: stats.playerName, inline: true },
                { name: 'Matches', value: `${stats.matches}`, inline: true },
                { name: 'Winrate', value: `${stats.winrate}%`, inline: true },
                { name: 'Best Win Streak', value: formatStreak('W', stats.bestWinStreak), inline: true },
                { name: 'Best Lose Streak', value: formatStreak('L', stats.bestLoseStreak), inline: true },
                { name: 'Current Streak', value: formatStreak(streakType, streakCount), inline: true }
            )
            .setColor(0x5865F2);

        return message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
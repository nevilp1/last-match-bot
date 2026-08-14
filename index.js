import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';
import 'dotenv/config'; // Removed the duplicate import
import axios from 'axios';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

import { pool } from './connection.js';
import { HEROES } from './heroes.js'; // <-- Added this to use local heroes!
import { generateItemRow } from './canvas.js';
import {
    getAccountIdByAlias, getDailyHeroWin, getMatchesForDailyHeroWin,
    removeAlias, saveAliases, resolveHero,
    getItemImage, getItems, getItem,
    getHeroStats, formatStreak
} from './utils.js';

// Force IPv4 resolution & Extend fetch timeout
dns.setDefaultResultOrder('ipv4first');
setGlobalDispatcher(new Agent({ connect: { timeout: 30000 } }));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Set a prefix to prevent the bot from evaluating normal conversations
const PREFIX = ''; 

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // Extract command and arguments cleanly
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- REGISTER ALIAS ---
    if (command === 'register') {
        const alias = args[0];
        const accountId = args[1];

        if (!alias || !accountId) return message.reply(`Usage: ${PREFIX}register <alias> <account_id>`);

        await saveAliases(message.author.id, accountId, alias);
        return message.reply(`Registered **${alias}** → ${accountId}`);
    }

    // --- REMOVE ALIAS ---
    if (command === 'remove') {
        const alias = args[0];
        if (!alias) return message.reply(`Usage: ${PREFIX}remove <alias>`);

        const error = await removeAlias(alias);
        if (error) {
            console.error(error.message);
            return message.reply('Failed to remove alias.');
        }
        return message.reply(`Removed alias **${alias}**`);
    }

    // --- LAST MATCH INFO ---
    if (command === 'lastmatch') {
        const input = args[0];
        if (!input) return message.reply(`Usage: ${PREFIX}lastmatch <alias/account_id>`);

        let accountId = await getAccountIdByAlias(input.toLowerCase()) || input;

        try {
            // OPTIMIZATION: Fetch Profile and Recent Matches at the SAME TIME
            const [profileRes, matchRes] = await Promise.all([
                axios.get(`https://api.opendota.com/api/players/${accountId}`, { timeout: 15000 }),
                axios.get(`https://api.opendota.com/api/players/${accountId}/recentMatches`, { timeout: 15000 })
            ]);

            const playerName = profileRes.data.profile?.personaname || 'Unknown Player';
            const lastMatch = matchRes.data[0];
            
            if (!lastMatch) return message.reply('No recent match found.');

            // Fetch specific match details
            const detailRes = await axios.get(`https://api.opendota.com/api/matches/${lastMatch.match_id}`, { timeout: 15000 });
            const detailMatch = detailRes.data.players.find(p => Number(p.account_id) === Number(accountId));

            // OPTIMIZATION: Use local HEROES lookup instead of an API call
            const heroKey = Object.keys(HEROES).find(key => HEROES[key].id === lastMatch.hero_id);
            const heroName = heroKey ? HEROES[heroKey].name : `Hero ID ${lastMatch.hero_id}`;

            const isWin = lastMatch.radiant_win === (lastMatch.player_slot < 128);
            const result = isWin ? 'Win 🟢' : 'Lose 🔴';

            // Time formatting
            const startTime = new Date(lastMatch.start_time * 1000);
            const diffMs = new Date() - startTime;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
            
            let timeAgo = `${minutes}m ago`;
            if (hours > 0) timeAgo = `${hours}h ` + timeAgo;
            if (days > 0) timeAgo = `${days}d ` + timeAgo;

            const formattedDuration = `${Math.floor(lastMatch.duration / 60)}:${(lastMatch.duration % 60).toString().padStart(2, '0')}`;

            // Item Canvas Generation
            const itemIds = [detailMatch.item_0, detailMatch.item_1, detailMatch.item_2, detailMatch.item_3, detailMatch.item_4, detailMatch.item_5];
            const itemsData = await getItems();
            const itemImages = itemIds.map(id => getItemImage(getItem(id, itemsData)));

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
                    { name: 'GPM', value: `${lastMatch.gold_per_min || 'N/A'}`, inline: true },
                    { name: 'XPM', value: `${lastMatch.xp_per_min || 'N/A'}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'Played', value: `${startTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB (${timeAgo})` }
                )
                .setColor(isWin ? 0x00ff00 : 0xff0000);

            // Safe fallback if buffer generation fails
            if (buffer) {
                embed.setImage('attachment://items.png');
                await message.reply({ embeds: [embed], files: [{ attachment: buffer, name: 'items.png' }] });
            } else {
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            if (error.response?.status === 404) return message.reply('Steam ID not found.');
            console.error(error);
            return message.reply('Failed to fetch match info.');
        }
    }

    // --- HELP COMMAND ---
    if (command === 'helpdota') {
        return message.reply([
            '📖 **Bot Commands**',
            `\`${PREFIX}helpdota\` - Show this help menu`,
            `\`${PREFIX}register <alias> <account_id>\` - Register a Steam account`,
            `\`${PREFIX}lastmatch <alias/id>\` - Show latest match info`,
            `\`${PREFIX}listaliases\` - Show registered aliases`,
            `\`${PREFIX}daily[hero] <alias/id>\` - Check daily win status`,
            `\`${PREFIX}wr[hero] <alias/id>\` - Check hero winrate/streak`
        ].join('\n'));
    }

    // --- DAILY HERO WIN ---
    if (command.startsWith('daily')) {
        const heroAlias = command.replace('daily', '');
        const inputId = args[0];

        if (!heroAlias || !inputId) return message.reply(`Usage: ${PREFIX}daily[hero] [alias/account_id]`);

        const accountId = await getAccountIdByAlias(inputId.toLowerCase()) || inputId;
        const hero = resolveHero(heroAlias);
        
        if (!hero) return message.reply(`Unknown hero: ${heroAlias}`);

        const matches = await getMatchesForDailyHeroWin(accountId, hero.id);
        return message.reply(getDailyHeroWin(matches, hero.name));
    }

    // --- ACCOUNT INFO ---
    if (command === 'account') {
        // SECURITY FIX: Never output passwords in plain text!
        return message.reply(`🔐 **Account Info**\nACCOUNT ID: ${process.env.ACCOUNT_ID}\n*(Password hidden for security)*`);
    }

    // --- LIST ALIASES ---
    if (command === 'listaliases') {
        try {
            const result = await pool.query('SELECT alias, account_id FROM aliases ORDER BY alias ASC');
            if (result.rows.length === 0) return message.reply('No aliases registered.');

            const aliasList = result.rows.map(row => `${row.alias} → ${row.account_id}`).join('\n');
            return message.reply(`📋 **Registered Aliases**\n${aliasList}`);
        } catch (err) {
            console.error("Failed to fetch aliases:", err);
            return message.reply('Failed to retrieve aliases from database.');
        }
    }

    // --- WINRATE & HERO STATS ---
    if (command.startsWith('wr')) {
        const heroAlias = command.replace('wr', '');
        const inputId = args[0];

        if (!heroAlias || !inputId) return message.reply(`Usage: ${PREFIX}wr[hero] [alias/account_id]`);

        const accountId = await getAccountIdByAlias(inputId.toLowerCase()) || inputId;
        const hero = resolveHero(heroAlias);
        
        if (!hero) return message.reply(`Unknown hero: ${heroAlias}`);

        const stats = await getHeroStats(accountId, hero.id);
        if (!stats) return message.reply('No matches found.');

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

client.login(process.env.TOKEN).catch((error) => {
    console.error("Failed to login to Discord. Network might be down.", error);
    // process.exit(1) tells the app to crash with an error code.
    // PM2 will detect this crash and automatically restart the bot!
    process.exit(1); 
});
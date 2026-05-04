import 'dotenv/config';
import axios from 'axios';
import { supabase } from './connection.js'
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import {
    getAccountIdByAlias, getDailyHeroWin, getMatchesForDailyHeroWin,
    removeAlias, saveAliases, resolveHero,
    getItemImage, getItems, getItem
} from './utils.js'
import { generateItemRow } from './canvas.js'


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
    if (message.content.startsWith('lastmatch')) {
        const args = message.content.split(' ');
        const input = args[1];

        let accountId = input;

        const aliasLookup = await getAccountIdByAlias(input?.toLowerCase());
        if (aliasLookup) accountId = aliasLookup;

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
            const detailRes = await axios.get(
                `https://api.opendota.com/api/matches/${lastMatch.match_id}.`
            );
            console.log(accountId)
            const detailMatch = detailRes.data.players.find(p => Number(p.account_id) === Number(accountId));


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

            // try embed message
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
            const itemImages = items.map(item => getItemImage(item)).filter(Boolean);

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

                    { name: 'GPM', value: `${lastMatch.gold_per_min}`, inline: true },
                    { name: 'XPM', value: `${lastMatch.xp_per_min}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },

                    { name: 'Played', value: `${startTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB (${timeAgo})` }
                )
                .setColor(result.includes('Win') ? 0x00ff00 : 0xff0000)
                .setImage('attachment://items.png'); // 👈 IMPORTANT

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
            console.log(error);
            return message.reply('Failed to fetch match info.');
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
    if (message.content.startsWith('daily')) {
        const args = message.content.split(' ');

        const command = args[0]; // e.g. dailyta
        const heroAlias = command.replace('daily', '');

        if (!heroAlias) {
            return message.reply('Usage: daily[hero] [alias/account_id]');
        }

        if (!args[1]) {
            return message.reply('Usage: daily[hero] [alias/account_id]');
        }

        let accountId = args[1];

        // resolve alias → account_id
        const { data: aliasData } = await supabase
            .from('aliases')
            .select('account_id')
            .eq('alias', accountId)
            .single();

        if (aliasData) {
            accountId = aliasData.account_id;
        }

        // resolve hero
        const hero = resolveHero(heroAlias);

        if (!hero) {
            return message.reply(`Unknown hero: ${heroAlias}`);
        }

        const matches = await getMatchesForDailyHeroWin(accountId, hero.id);

        const tracker = getDailyHeroWin(matches, hero.name);

        message.reply(tracker);
    }
    if (message.content === 'account') {
        return message.reply([
            '🔐 **Account Info**',
            // eslint-disable-next-line no-undef
            `ACCOUNT ID: ${process.env.ACCOUNT_ID}`,
            // eslint-disable-next-line no-undef
            `PASSWORD: ${process.env.ACCOUNT_PASSWORD}`
        ].join('\n'));
    }
    if (message.content === 'listaliases') {
        const { data, error } = await supabase
            .from('aliases')
            .select('alias, account_id')
            .order('alias', { ascending: true });

        if (error || !data.length) {
            return message.reply('No aliases registered.');
        }

        const aliasList = data
            .map(row => `${row.alias} → ${row.account_id}`)
            .join('\n');

        return message.reply([
            '📋 **Registered Aliases**',
            aliasList
        ].join('\n'));
    }
});

// eslint-disable-next-line no-undef
client.login(process.env.TOKEN);
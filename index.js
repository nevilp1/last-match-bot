
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config';
import axios from 'axios';
import { Client, GatewayIntentBits } from 'discord.js';
import { HEROES } from './heroes.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function loadAliases(accountId) {
  const { data } = await supabase
    .from('aliases')
    .select('alias')
    .eq('account_id', accountId)
    .single();

  return data?.alias;
}

async function saveAliases(discordId, accountId, alias) {
  const { data, error } = await supabase
    .from('aliases')
    .upsert(
      [{
        discord_id: discordId,
        account_id: accountId,
        alias: alias.toLowerCase()
      }],
      {
        onConflict: 'alias'
      }
    );

  if (error) console.error(error);
  return data;
}

async function getAccountIdByAlias(alias) {
  const { data } = await supabase
    .from('aliases')
    .select('account_id')
    .eq('alias', alias)
    .single();

  return data?.account_id;
}
async function removeAlias(alias) {
  const { error } = await supabase
    .from('aliases')
    .delete()
    .eq('alias', alias.toLowerCase());

  return error;
}

async function getMatchesForDailyHeroWin(accountId, heroId) {
    try {
        const response = await axios.get(
            `https://api.opendota.com/api/players/${accountId}/recentMatches`
        );

        const matches = response.data;
        const WIB_OFFSET = 7 * 60 * 60 * 1000;

        const now = new Date(Date.now() + WIB_OFFSET);
        const today = now.getUTCDay();
        const mondayIndex = today === 0 ? 6 : today - 1;

        const startOfWeek = new Date(now);
        startOfWeek.setUTCDate(now.getUTCDate() - mondayIndex);
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const endOfToday = new Date(now);
        endOfToday.setUTCHours(23, 59, 59, 999);

        return matches.filter(match => {
            const matchDate = new Date(match.start_time * 1000 + WIB_OFFSET);

            const inCurrentWeek =
                matchDate >= startOfWeek &&
                matchDate <= endOfToday;

            const isRanked = match.lobby_type === 7;
            const isHero = match.hero_id === heroId;

            const isWin =
                (match.player_slot < 128 && match.radiant_win) ||
                (match.player_slot >= 128 && !match.radiant_win);

            return inCurrentWeek && isRanked && isHero && isWin;
        });

    } catch (error) {
        console.error('Error fetching matches:', error.message);
        return [];
    }
}

function getDailyHeroWin(matches, heroname) {
    if (!matches.length) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const now = new Date();
        const today = now.getDay(); // 0=Sun, 1=Mon...
        const mondayIndex = today === 0 ? 6 : today - 1;

        const result = [];

        for (let i = 0; i < 7; i++) {
            if (i >= mondayIndex) {
                result.push('❓'); // today + future
            } else {
                result.push('❌'); // past only
            }
        }

        const dayLine = days.map(d => d.padEnd(5)).join('');
        const resultLine = `${result[0]}   ${result[1]}   ${result[2]}   ${result[3]}  ${result[4]}   ${result[5]}   ${result[6]}`;

        return `📅 **Daily ${heroname} Win**\n\`\`\`\n${dayLine}\n${resultLine}\n\`\`\``;
    }
    const WIB_OFFSET = 7 * 60 * 60 * 1000;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result = [];
    
    const now = new Date(Date.now() + WIB_OFFSET);
    const today = now.getUTCDay(); // ✅ use UTC version
    const mondayIndex = today === 0 ? 6 : today - 1;

    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - mondayIndex);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    // Precompute winning days (WIB adjusted)
    const winDays = new Set(
        matches.map(match => {
            const d = new Date(match.start_time * 1000 + WIB_OFFSET);
            return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
        })
    );

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);

        if (i > mondayIndex) {
            result.push('❓'); // future
        } else if (i === mondayIndex) {
            const key = `${dayDate.getUTCFullYear()}-${dayDate.getUTCMonth()}-${dayDate.getUTCDate()}`;
            result.push(winDays.has(key) ? '✅' : '❓'); // today
        } else {
            const key = `${dayDate.getUTCFullYear()}-${dayDate.getUTCMonth()}-${dayDate.getUTCDate()}`;
            result.push(winDays.has(key) ? '✅' : '❌'); // past
        }
    }

    const dayLine = days.map(d => d.padEnd(5)).join('');
    const resultLine = `${result[0]}   ${result[1]}   ${result[2]}   ${result[3]}  ${result[4]}   ${result[5]}   ${result[6]}`;

    return `📅 **Daily ${heroname} Win**\n\`\`\`\n${dayLine}\n${resultLine}\n\`\`\``;
}

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

            message.reply([
            '🎮 **Last Match Info**',
            `Player: ${accountId}`,
            `Nickname: ${playerName}`,
            `Hero: ${heroName}`,
            `K/D/A: ${lastMatch.kills}/${lastMatch.deaths}/${lastMatch.assists}`,
            `Result: ${result}`,
            `GPM: ${gpm}`,
            `XPM: ${xpm}`,
            `Duration: ${formattedDuration}`,
            `Played: ${startTime.toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta'
                })} (${timeAgo})`
            ].join('\n'));

        } catch (error) {
            if (error.response?.status === 404) {
                return message.reply('Steam ID not found.');
            }

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
    if (message.content.startsWith('dailyta')) {
        const args = message.content.split(' ');
        
        if (!args[1]) {
            return message.reply('Usage: dailyta [alias/account_id]');
        }

        let accountId = args[1];

        // Check alias first
        const { data: aliasData, error } = await supabase
            .from('aliases')
            .select('account_id')
            .eq('alias', accountId)
            .single();

        if (aliasData) {
            accountId = aliasData.account_id;
        }

        const hero = HEROES.templar_assassin;
        // Fetch matches
        const matches = await getMatchesForDailyHeroWin(accountId, hero.id);

        const tracker = getDailyHeroWin(matches, hero.name);

        message.reply(tracker);
    }
    if (message.content.startsWith('dailyjug')) {
        const args = message.content.split(' ');

        if (!args[1]) {
            return message.reply('Usage: dailyjug [alias/account_id]');
        }

        let accountId = args[1];

        // alias lookup
        const { data: aliasData } = await supabase
            .from('aliases')
            .select('account_id')
            .eq('alias', accountId)
            .single();

        if (aliasData) {
            accountId = aliasData.account_id;
        }

        const hero = HEROES.juggernaut;
        const matches = await getMatchesForDailyHeroWin(accountId, hero.id);

        const tracker = getDailyHeroWin(matches, hero.name);

        message.reply(tracker);
    }
    if (message.content === 'account') {
    return message.reply([
        '🔐 **Account Info**',
        `ACCOUNT ID: ${process.env.ACCOUNT_ID}`,
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

client.login(process.env.TOKEN);
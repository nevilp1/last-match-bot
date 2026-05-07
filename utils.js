import { HEROES, HERO_ALIASES } from './heroes.js';
import axios from 'axios';
import { supabase } from './connection.js'

let itemsCache = null;

export async function getItems() {
  if (!itemsCache) {
    const res = await axios.get('https://api.opendota.com/api/constants/items');
    itemsCache = res.data;
  }
  return itemsCache;
}

export function getItem(itemId, itemsData) {
  if (!itemId || itemId === 0) return null;

  const item = Object.values(itemsData).find(i => i.id === itemId);
  return item || null;
}

export function getItemImage(item) {
  return item ? `https://cdn.cloudflare.steamstatic.com${item.img}` : null;
}

export function resolveHero(input) {
  const key = input.toLowerCase();

  const heroKey = HERO_ALIASES[key] || key;

  return HEROES[heroKey];
}

export async function loadAliases(accountId) {
  const { data } = await supabase
    .from('aliases')
    .select('alias')
    .eq('account_id', accountId)
    .single();

  return data?.alias;
}

export async function saveAliases(discordId, accountId, alias) {
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

export async function getAccountIdByAlias(alias) {
  const { data } = await supabase
    .from('aliases')
    .select('account_id')
    .eq('alias', alias)
    .single();

  return data?.account_id;
}
export async function removeAlias(alias) {
  const { error } = await supabase
    .from('aliases')
    .delete()
    .eq('alias', alias.toLowerCase());

  return error;
}

export async function getMatchesForDailyHeroWin(accountId, heroId) {
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

export function getDailyHeroWin(matches, heroname) {
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

export async function getHeroStats(accountId, heroId) {
  const response = await fetch(
    `https://api.opendota.com/api/players/${accountId}/matches?hero_id=${heroId}&limit=100`
  );
  const profileRes = await axios.get(
    `https://api.opendota.com/api/players/${accountId}`
  );

  const playerName =
    profileRes.data.profile?.personaname || 'Unknown Player';

  const matches = await response.json();

  if (!matches.length) {
    return null;
  }

  let wins = 0;

  // streak tracking
  let currentType = null;
  let currentCount = 0;

  let bestWin = 0;
  let bestLose = 0;

  let activeType = null;
  let activeCount = 0;

  matches.forEach((match, index) => {
    const isRadiant = match.player_slot < 128;
    const win =
      (isRadiant && match.radiant_win) ||
      (!isRadiant && !match.radiant_win);

    if (win) wins++;

    const result = win ? "W" : "L";

    // current streak
    if (index === 0) {
      currentType = result;
      currentCount = 1;
    } else if (result === currentType && currentCount === index) {
      currentCount++;
    }

    // best streaks
    if (result === activeType) {
      activeCount++;
    } else {
      activeType = result;
      activeCount = 1;
    }

    if (result === "W") {
      bestWin = Math.max(bestWin, activeCount);
    } else {
      bestLose = Math.max(bestLose, activeCount);
    }
  });

  return {
    playerName: playerName,
    matches: matches.length,
    wins,
    losses: matches.length - wins,
    winrate: ((wins / matches.length) * 100).toFixed(2),
    currentStreak: `${currentType}${currentCount}`,
    bestWinStreak: bestWin,
    bestLoseStreak: bestLose,
  };
}

export function formatStreak(type, count) {
  if (type === 'W') {
    return count === 1 ? '1 Win' : `${count} Wins`;
  }

  return count === 1 ? '1 Loss' : `${count} Losses`;
}
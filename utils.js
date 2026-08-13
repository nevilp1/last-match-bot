import { HEROES, HERO_ALIASES } from './heroes.js';
import axios from 'axios';
import { pool } from './connection.js';
import path from 'path';

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
  if (!item || !item.img) return null; 

  // Extract just the filename (e.g., "lotus_orb.png")
  const fileName = item.img.split('/').pop().split('?')[0];
  
  // Return the absolute local path to your assets folder
  return path.join(process.cwd(), 'assets', 'items', fileName);
}

export function resolveHero(input) {
  const key = input.toLowerCase();
  const heroKey = HERO_ALIASES[key] || key;
  return HEROES[heroKey];
}

// ---------------------------------------------------------
// DATABASE OPERATIONS
// ---------------------------------------------------------

export async function loadAliases(accountId) {
  try {
    const { rows } = await pool.query(
      'SELECT alias FROM aliases WHERE account_id = $1 LIMIT 1',
      [accountId]
    );
    return rows.length > 0 ? rows[0].alias : null;
  } catch (error) {
    console.error('Error loading aliases:', error);
    return null;
  }
}

export async function saveAliases(discordId, accountId, alias) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO aliases (discord_id, account_id, alias) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (alias) 
       DO UPDATE SET discord_id = EXCLUDED.discord_id, account_id = EXCLUDED.account_id 
       RETURNING *`,
      [discordId, accountId, alias.toLowerCase()]
    );
    return rows;
  } catch (error) {
    console.error('Error saving alias:', error);
    return null;
  }
}

export async function getAccountIdByAlias(alias) {
  try {
    const { rows } = await pool.query(
      'SELECT account_id FROM aliases WHERE alias = $1 LIMIT 1',
      [alias]
    );
    return rows.length > 0 ? rows[0].account_id : null;
  } catch (error) {
    console.error('Error getting account ID:', error);
    return null;
  }
}

export async function removeAlias(alias) {
  try {
    await pool.query(
      'DELETE FROM aliases WHERE alias = $1',
      [alias.toLowerCase()]
    );
    return null;
  } catch (error) {
    console.error('Error removing alias:', error);
    return error; 
  }
}

// ---------------------------------------------------------
// MATCH & STATS OPERATIONS
// ---------------------------------------------------------

export async function getMatchesForDailyHeroWin(accountId, heroId) {
  try {
    const response = await axios.get(
      `https://api.opendota.com/api/players/${accountId}/recentMatches`,
      { timeout: 15000 }
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
  const today = now.getUTCDay();
  const mondayIndex = today === 0 ? 6 : today - 1;

  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - mondayIndex);
  startOfWeek.setUTCHours(0, 0, 0, 0);

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
  try {
    const response = await axios.get(
      `https://api.opendota.com/api/players/${accountId}/matches?hero_id=${heroId}&limit=1000`,
      { timeout: 15000 }
    );
    const profileRes = await axios.get(
      `https://api.opendota.com/api/players/${accountId}`,
      { timeout: 15000 }
    );

    const playerName = profileRes.data.profile?.personaname || 'Unknown Player';
    const matches = response.data; // Fixed: Use response.data instead of await response.json()

    if (!matches || !matches.length) {
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
  } catch (error) {
    console.error('Error in getHeroStats:', error.message);
    return null;
  }
}

export function formatStreak(type, count) {
  if (type === 'W') {
    return count === 1 ? '1 Win' : `${count} Wins`;
  }

  return count === 1 ? '1 Loss' : `${count} Losses`;
}
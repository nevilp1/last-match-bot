# Discord Dota 2 Bot

A Discord bot built with JavaScript using Discord.js and OpenDota API to fetch recent Dota 2 match information.

## Disclaimer

Latest version (main-pg) adds huge optimization to the items & heroes rendering process using local data, replacing external API calls on the older version that slowing down the lastmatch command. Database also shifted to native PostgreSQL (previous version use Supabase PostgreSQL) to eliminate unnecessary services. Future development will take place on the main-pg branch, and the older version will no longer be maintained.

## Features

- Register aliases for Steam / OpenDota account IDs
- Fetch latest Dota 2 match info
- Show Hero, K/D/A, GPM, XPM, Duration, and Result
- List all registered aliases
- Hidden account info command
- Stores aliases in PostgreSQL

## Commands

### helpdota
Show command list.

Example:
```bash
helpdota
```

## Sensitive Information

This project uses environment variables to store sensitive credentials and private information.

Never commit your `.env` file to GitHub.

Example `.gitignore`:

```bash
.env
```

## Database Setup

Setup table aliases to store mapping data of SteamID

```
CREATE TABLE public.aliases (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	discord_id text NOT NULL,
	account_id text NOT NULL,
	alias text NOT NULL,
	created_at timestamptz DEFAULT timezone('utc'::text, now()) NULL,
	CONSTRAINT aliases_account_id_not_null NOT NULL account_id,
	CONSTRAINT aliases_alias_key UNIQUE (alias),
	CONSTRAINT aliases_alias_not_null NOT NULL alias,
	CONSTRAINT aliases_discord_id_not_null NOT NULL discord_id,
	CONSTRAINT aliases_id_not_null NOT NULL id,
	CONSTRAINT aliases_pkey PRIMARY KEY (id)
);
```

## To-be Improved
- Group aliases for each discord server
- Error handling for daily[hero] command (e.g 522 error code case)

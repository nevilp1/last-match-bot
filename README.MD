# Discord Dota 2 Bot

A Discord bot built with JavaScript using Discord.js and OpenDota API to fetch recent Dota 2 match information.

## Features

- Register aliases for Steam / OpenDota account IDs
- Fetch latest Dota 2 match info
- Show Hero, K/D/A, GPM, XPM, Duration, and Result
- List all registered aliases
- Hidden account info command
- Stores aliases in Supabase

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

## To-be Improved
- Group aliases for each discord server
- Error handling for daily[hero] command (e.g 522 error code case)
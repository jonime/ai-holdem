export const HOME_MARKDOWN = `# AI Hold'em

AI Hold'em is a browser-based Texas Hold'em demo where people can share a table with provider-backed or deterministic AI poker players. Create a table, invite another person, assign bots to open seats, choose the blinds and starting stacks, and play complete no-limit Hold'em hands in the browser.

## How the table works

The poker engine is authoritative for cards, turn order, legal actions, betting, pots, and winners. Every human or AI proposal is validated before it changes the game. Tables support two to six seats, configurable bot difficulty, action history, hand history, card reveals, and live refreshes backed by durable game state.

## AI decisions and privacy

AI Hold'em includes TypeSafe System One, configurable OpenRouter models, and the deterministic offline Equity Rules bot. The application keeps active private cards and provider inputs away from spectators, and reveals only the information appropriate for each seat and completed hand. This is a technical demo, not a real-money gambling service.

## Developer resources

- [Developer resources](/en-US/developers)
- [Agent and site map](/llms.txt)
- [XML sitemap](/sitemap.xml)
- [Source code](https://github.com/jonime/ai-holdem)
`;

export const DEVELOPERS_MARKDOWN = `# AI Hold'em developer resources

AI Hold'em is an open-source Next.js and TypeScript demonstration of multiplayer, agent-assisted Texas Hold'em. The installed poker engine remains authoritative while server-side services validate human and AI actions and persist version-checked state in Supabase.

## Integration status

The JSON endpoints under \`/api/games\` support the web application itself. They are not currently a versioned public API, and AI Hold'em does not publish an SDK, API key program, or MCP server. Integrators should review the repository's architecture and security boundaries before reusing those routes.

## Resources

- [Project repository](https://github.com/jonime/ai-holdem)
- [Setup and architecture](https://github.com/jonime/ai-holdem#readme)
- [Contribution guide](https://github.com/jonime/ai-holdem/blob/main/CONTRIBUTING.md)
- [Agent and site map](/llms.txt)
- [XML sitemap](/sitemap.xml)
`;

export const NOT_FOUND_MARKDOWN = `# 404: Page not found

AI Hold'em could not find the requested page. Use the [agent and site map](/llms.txt) to find the homepage, developer resources, and other public files.
`;

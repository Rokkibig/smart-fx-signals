// Ambient env for MCP tool files. Tool handlers execute on the Deno edge
// function; process.env is provided there via the mcp-js runtime.
declare const process: { env: Record<string, string | undefined> };

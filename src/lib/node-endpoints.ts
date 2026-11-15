/** This node only. Sabretooth LAN. Do not use localhost or 192.168.0.15. */
export const NODE_IPV4 = '192.168.0.8';

export const OMNIROUTE_ORIGIN = `http://${NODE_IPV4}:20128`;
export const OMNIROUTE_DASHBOARD = `${OMNIROUTE_ORIGIN}/dashboard`;
export const OMNIROUTE_API = `${OMNIROUTE_ORIGIN}/v1`;
export const OMNIROUTE_MCP_STREAM = `${OMNIROUTE_ORIGIN}/api/mcp/stream`;

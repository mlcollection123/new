import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://agent:agent@localhost:5432/agent",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  apolloKey: process.env.APOLLO_API_KEY ?? "",
  senderName: process.env.SENDER_NAME ?? "",
  senderCompany: process.env.SENDER_COMPANY ?? "",
  senderAddress: process.env.SENDER_ADDRESS ?? "",
};

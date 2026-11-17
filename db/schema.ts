import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
export const aiRuns=sqliteTable("ai_runs",{
 runId:text("run_id").primaryKey(),userId:text("user_id").notNull(),requestId:text("request_id").notNull(),day:text("day").notNull(),createdAt:integer("created_at").notNull(),status:text("status").notNull(),reservedMicros:integer("reserved_micros").notNull(),usageJson:text("usage_json"),completedAt:integer("completed_at")
},t=>[uniqueIndex("ai_runs_user_request").on(t.userId,t.requestId),index("ai_runs_day").on(t.day),index("ai_runs_user_created").on(t.userId,t.createdAt)]);
// Separate read-only MCP source-fetch reservations. Never changes AI allowance.
export const mcpRequests=sqliteTable("mcp_requests",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),day:text("day").notNull(),reservedFetches:integer("reserved_fetches").notNull()
},t=>[index("mcp_requests_day").on(t.day),index("mcp_requests_user_day").on(t.userId,t.day)]);

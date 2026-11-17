import {env} from "cloudflare:workers";
import {handleMCP} from "../../server/mcp.mjs";
export const dynamic="force-dynamic";
export async function POST(request:Request){return handleMCP(request,env);}
export async function GET(request:Request){return handleMCP(request,env);}

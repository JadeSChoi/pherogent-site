import {env} from "cloudflare:workers";
import {runSectionChat} from "../../../../server/api.mjs";
export const dynamic="force-dynamic";
export async function POST(request:Request){return runSectionChat(request,env);}

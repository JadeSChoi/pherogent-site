import {env} from "cloudflare:workers";
import {getStatus} from "../../../../server/api.mjs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return getStatus(request,env);}

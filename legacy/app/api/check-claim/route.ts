import {env} from "cloudflare:workers";
import {runCheck} from "../../../server/api.mjs";
export const dynamic="force-dynamic";
export async function POST(request:Request){return runCheck(request,env);}

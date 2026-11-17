import {handleStudyWorkflow} from '../../../../server/study-workflow.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleStudyWorkflow(request);}

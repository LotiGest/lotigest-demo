import {createClaimHandler} from '../../../nexora-qa-initial-access.mjs';
const claim=createClaimHandler();
export async function onRequest({request,env}){
 if(env.NEXORA_QA_LICENSE!=='enabled')return Response.json({error:'not_available'},{status:404,headers:{'cache-control':'no-store'}});
 return claim(request,env);
}

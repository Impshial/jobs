export const dynamic = 'force-dynamic';
export function GET(){
 if(process.env.NEXTMOVE_LOCAL!=='1')return new Response(null,{status:404});
 return Response.json({app:'nextmove-local',ownerPid:Number(process.env.NEXTMOVE_LOCAL_OWNER_PID)},{headers:{'Cache-Control':'no-store'}});
}

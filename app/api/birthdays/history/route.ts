import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HistoryRow={id:string;send_date:string|null;group_id:string|null;group_name:string|null;message_type:string|null;member_ids:string[]|null;member_names:string[]|null;message:string|null;status:string|null;error_message:string|null;created_at:string|null};

function getClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return null;return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}

export async function GET(){const client=getClient();if(!client)return NextResponse.json({error:'Supabase não configurado.'},{status:503});const{data,error}=await client.from('birthday_messages').select('id, send_date, group_id, group_name, message_type, member_ids, member_names, message, status, error_message, created_at').order('created_at',{ascending:false}).limit(100);if(error)return NextResponse.json({error:'Não foi possível carregar o histórico.',details:error.message},{status:500});const history=((data||[])as HistoryRow[]).map(row=>({id:row.id,sendDate:row.send_date,groupId:row.group_id||'',groupName:row.group_name||'Grupo não identificado',type:row.message_type||'simulation',memberIds:row.member_ids||[],memberNames:row.member_names||[],message:row.message||'',status:row.status||'sent',errorMessage:row.error_message||'',createdAt:row.created_at}));return NextResponse.json({history})}

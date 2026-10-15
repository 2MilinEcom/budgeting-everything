import audit from '../../../data/audit.json';
import fs from 'node:fs';
import path from 'node:path';
import {interpretLocal,sanitizeFilters,analyze,defaultAnswer,DATA_END} from '../../../lib/finance-engine.mjs';
import {interpretWithAI,explainWithAI} from '../../../lib/ai-finance.mjs';
import {buildInsights,detectFocus} from '../../../lib/finance-insights.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const moneyForAnswer=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n||0);
function local(req){const host=req.headers.get('host')||'',origin=req.headers.get('origin')||'';return /^(127\.0\.0\.1|localhost):\d+$/.test(host)&&(!origin||origin===`http://${host}`)&&new URL(req.url).protocol==='http:';}
function reviews(){try{const p=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','reviews.json'),'utf8'));return p&&typeof p==='object'?p:{}}catch{return {}}}
const configured=()=>!!process.env.OPENAI_API_KEY;
function status(){return {configured:configured(),engine:'verified-v4',records:audit.transactions.length,cutoff:DATA_END,orders:audit.orders.length,products:audit.products.length,model:process.env.OPENAI_FINANCE_MODEL||'gpt-4.1'};}
export async function GET(req){if(!local(req))return Response.json({error:'Private local dashboard only'},{status:403});return Response.json(status(),{headers:{'Cache-Control':'no-store'}});}
export async function POST(req){
 if(!local(req))return Response.json({error:'Private local dashboard only'},{status:403});let b;
 try{const input=await req.text();if(input.length>60000)return Response.json({error:'Request too large'},{status:413});b=JSON.parse(input)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const base=sanitizeFilters(b.filters);let question=String(b.question||'').slice(0,1200).trim();const pageOnly=b.action==='page';
 if(!pageOnly&&question.length<3)return Response.json({error:'Please enter your financial question.'},{status:400});
 // Pagination never needs the language model and reuses the exact prior scope.
 const asOf=/^2026-\d\d-\d\d$/.test(b.asOf||'')?b.asOf:new Date().toISOString().slice(0,10);
 const localPlan=pageOnly?{filters:base,changes:[]}:interpretLocal(question,base,asOf);
 const focus=detectFocus(question);
 let plan=localPlan.filters,warning=null,clarification=null,plannerUsed=false;
 if(!pageOnly&&b.useAI!==false&&configured()&&!focus.clothing&&!focus.detail&&!focus.refRefund){
  try{const proposed=await interpretWithAI(question,base,plan,asOf);plan=proposed.filters;clarification=proposed.clarification;plannerUsed=true;}
  catch(err){warning=`AI interpretation unavailable (${err.message}). Applied verified local filters instead.`;}
 }
 const result=analyze(audit,plan,reviews(),{page:pageOnly?b.page:1,withReceipts:!!b.withReceipts||focus.detail||focus.clothing});
 const insight=pageOnly?null:buildInsights(question,audit,plan,reviews(),b.merchantKnowledge||{});
 let answer=defaultAnswer(result,question);
 if(insight?.focus?.clothing){const info=insight.cards.find(x=>x.type==='clothing');answer=`Among ${info.scopeCount} charges in the current filters, ${info.knownCount} are at clothing-focused retailers or merchants you've classified as clothing (${moneyForAnswer(info.knownTotal)} gross). ${info.possibleCount} more are from mixed-category stores where clothing is possible but unverified. Review the itemized rows below; merchant identity alone cannot tell us which products were purchased.`;}
 else if(insight?.focus?.detail){const details=insight.cards.filter(x=>x.type==='merchant');answer=details.length?`I found ${details.reduce((n,x)=>n+x.charges.length,0)} matching charges in the current selection. Their dates and amounts are shown below, along with any same-amount credit candidates. Amex descriptions do not establish the exact booked service or item.`:'I could not locate that exact merchant in the currently filtered charges. Try quoting its full descriptor or clearing the current filters.';}
 if(insight?.focus?.refRefund){answer=`I checked ${insight.scopeCount} selected charges against the full 2026 credit-matching evidence, including refunds posted later than the purchase date. See confirmed versus unverified matches below.`;}
 if(insight?.focus?.clothing&&insight.focus.detail)answer+=' I also inspected the specific charge you asked about below.';
 const history=Array.isArray(b.history)?b.history.filter(x=>x&&typeof x.text==='string').slice(-6).map(x=>({role:x.role,text:x.text.slice(0,450)})):[];
 let commentary=null;if(!pageOnly&&b.useAI!==false&&configured()&&result.count){
  try{commentary=await explainWithAI(question,history,{...result,insights:insight})}catch(err){warning=[warning,`AI explanation unavailable (${err.message}). Verified ledger results remain available.`].filter(Boolean).join(' ')}
 }
 return Response.json({answer,commentary,warning,clarification,plannerUsed,asOf,query:question,...result,insights:insight,mode:plan.mode,changes:localPlan.changes},{headers:{'Cache-Control':'no-store'}});
}

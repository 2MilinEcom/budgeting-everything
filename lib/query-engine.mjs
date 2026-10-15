// Auditable transaction query engine. No AI arithmetic or AI-generated SQL.
export const BASE={start:'2026-01-01',end:'2026-10-09',kind:'Charge',minimum:null,maximum:null,merchant:'',category:'',card:'',purpose:'',exclusions:[],sort:'largest',groupBy:'merchant',limit:100};
const categoryAliases={advertising:'Advertising',ads:'Advertising',insurance:'Insurance',dining:'Dining / delivery',restaurants:'Dining / delivery',shopping:'Shopping / household',legal:'Legal',software:'Business software / services',transport:'Transport / auto',inventory:'Inventory / suppliers',entertainment:'Entertainment / subscriptions'};
const allCategories=['Advertising','Insurance','Dining / delivery','Shopping / household','Shopping / leisure','Legal','Business software / services','Transport / auto','Inventory / suppliers','Entertainment / subscriptions','Card fees','Other / uncategorized'];
const validDate=s=>/^2026-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const dateISO=(d)=>d.toISOString().slice(0,10);
function shiftDay(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return dateISO(d)}
function shiftMonth(date,n){const [y,m,day]=date.split('-').map(Number);let d=new Date(Date.UTC(y,m-1+n,1));const yy=d.getUTCFullYear(),mm=d.getUTCMonth()+1;const max=new Date(Date.UTC(yy,mm,0)).getUTCDate();d.setUTCDate(Math.min(day,max));return dateISO(d)}
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const categoryFor=s=>Object.entries(categoryAliases).find(([k])=>new RegExp('\\b'+k+'\\b','i').test(s))?.[1];
const negated=(s)=>/\b(ignore|exclude|excluding|without|remove|except|not including|leave out|skip)\b/i.test(s);
function excludeFrom(text){let arr=[];const q=text.toLowerCase();if(/\b(advertis\w*|ads)\b/.test(q))arr.push('Advertising');if(/\bshopify\b/.test(q))arr.push('shopify');if(/\bcredit|refund|rewards?\b/.test(q)&&/\b(ignore|exclude|excluding|without)\b/.test(q))arr.push('credits');return arr}
export function parseQuestion(question,previous={},asOf='2026-10-11'){
 const q=String(question||'').trim(),low=q.toLowerCase();const plan={...BASE,...previous,exclusions:[...(previous.exclusions||[])]};
 const updates=[];const fresh=!previous||Object.keys(previous).length===0;
 const refundWords=/\b(refunds?|credits?|returned|reimbursements?|chargebacks?)\b/i.test(q);
 const chargeWords=/\b(charges?|purchases?|transactions?|spend|spending|expenses?|payments?)\b/i.test(q);
 if(refundWords&&!/\b(ignore|exclude|excluding|without|remove|except)\s+(?:\w+\s+){0,3}(?:refund|credit)/i.test(q)&&!(/\brefund\b/i.test(q)&&/\bexclude\b/i.test(q))) {plan.kind='Credit / refund';updates.push('Credit/refund records');}
 else if(/\b(charges?|purchases?|expenses?|spent|spending)\b/i.test(q)&&!(/\brefunds?\b/i.test(q))) {plan.kind='Charge';updates.push('Charges only');}
 // Explicit date ranges always win. Interpret fixed anchor relative to supplied anchor, not current month.
 let match=low.match(/\b(\d{1,3})\s+days?\s+before\s+(?:the\s+)?(?:date\s+of\s+)?(aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|jul(?:y)?|jun(?:e)?|may|apr(?:il)?|mar(?:ch)?|feb(?:ruary)?|jan(?:uary)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(2026))?/i);
 if(match){const names={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10};let month=names[match[2].slice(0,3)];const end=`2026-${String(month).padStart(2,'0')}-${String(Number(match[3])).padStart(2,'0')}`;plan.start=shiftDay(end,-Number(match[1]));plan.end=end;updates.push('Explicit relative date range');}
 else {const dates=Array.from(q.matchAll(/\b(2026-\d\d-\d\d)\b/g)).map(x=>x[1]);if(dates.length>=2&&dates.every(validDate)){plan.start=dates[0];plan.end=dates[1];updates.push('Explicit dates');}
 else if(/\b(past|last|previous)\s+(\d+)\s+(days?|months?)\b/i.test(q)){const m=low.match(/\b(?:past|last|previous)\s+(\d+)\s+(days?|months?)\b/);let anchor=asOf>BASE.end?BASE.end:asOf;plan.end=anchor;plan.start=m[2].startsWith('month')?shiftMonth(anchor,-Number(m[1])):shiftDay(anchor,-Number(m[1]));updates.push('Recent date range');}
 else {const named=low.match(/\b(january|february|march|april|may|june|july|august|september|october)\b/);if(named){const month=['january','february','march','april','may','june','july','august','september','october'].indexOf(named[1])+1;plan.start=`2026-${String(month).padStart(2,'0')}-01`;plan.end=`2026-${String(month).padStart(2,'0')}-${String(new Date(Date.UTC(2026,month,0)).getUTCDate()).padStart(2,'0')}`;updates.push('Named month');}}}
 // Precise $ thresholds. Strictly greater than means > rather than >=.
 const amount=low.match(/(?:above|over|greater than|more than|exceeding|larger than)\s*\$?([\d,]+(?:\.\d{1,2})?)/);
 if(amount){plan.minimum=Math.round(Number(amount[1].replace(/,/g,''))*100)+1;updates.push('Strict minimum amount');}
 const atLeast=low.match(/(?:at least|minimum of)\s*\$?([\d,]+(?:\.\d{1,2})?)/);if(atLeast){plan.minimum=Math.round(Number(atLeast[1].replace(/,/g,''))*100);updates.push('Inclusive minimum amount');}
 if(/\b(no minimum|any amount|all amounts)\b/.test(low))plan.minimum=null;
 if(negated(q)){for(const item of excludeFrom(q))if(!plan.exclusions.includes(item))plan.exclusions.push(item);updates.push('Exclusions');}
 if(/\b(include|add back|stop excluding)\b/.test(low)&&/\b(advertising|ads|shopify)\b/.test(low)){for(const item of excludeFrom(q))plan.exclusions=plan.exclusions.filter(v=>v!==item);}
 if(/\b(gold card|business card)\b/.test(low)){plan.card=low.includes('business card')?'Business Card':'Gold Card';}
 if(/\bpersonal (?:expenses|spending|charges|purchases)\b/.test(low))plan.purpose='Personal';
 if(/\bbusiness (?:expenses|spending|charges|purchases)\b/.test(low))plan.purpose='Business';
 if(/\btop\s+(\d+)\b/.test(low)){plan.limit=Math.min(500,Number(low.match(/\btop\s+(\d+)\b/)[1]));plan.sort='largest';}
 if(/\b(all|every|list|which|what are the other charges)\b/.test(low))plan.limit=500;
 if(/\bnewest|most recent\b/.test(low))plan.sort='newest';
 if(/\boldest\b/.test(low))plan.sort='oldest';
 if(/\b(by month|each month|monthly)\b/.test(low))plan.groupBy='month';
 else if(/\b(by category|categories|category breakdown)\b/.test(low))plan.groupBy='category';
 else if(/\b(by merchant|biggest merchants|which merchants)\b/.test(low))plan.groupBy='merchant';
 if(/\b(reset|start over|clear filters)\b/.test(low))return {filters:{...BASE,exclusions:[]},updates:['Reset']};
 const hasIntent=updates.length||/\b(ignore|exclude|show|list|break down|compare|what|which|how|where|top)\b/i.test(q);
 return {filters:plan,updates,needsClarification:!hasIntent&&fresh};
}
function cents(x){return Math.round(Number(x)*100)}
function txSort(f){return (a,b)=>f.sort==='newest'?b.date.localeCompare(a.date):f.sort==='oldest'?a.date.localeCompare(b.date):cents(b.amount)-cents(a.amount)||a.date.localeCompare(b.date)}
export function executeQuery(transactions,filters,reviewOverrides={}){
 const f={...BASE,...filters};const exclusions=new Set(f.exclusions||[]);
 const records=transactions.filter(t=>{
 const category=reviewOverrides[t.id]?.category||t.category;const purpose=reviewOverrides[t.id]?.purpose||t.purpose;
 if(!t.inPeriod||t.date<f.start||t.date>f.end||t.kind!==f.kind)return false;
 if(f.card&&t.card!==f.card||f.purpose&&purpose!==f.purpose||f.category&&category!==f.category)return false;
 if(f.merchant&&!normalize(t.merchant).includes(normalize(f.merchant)))return false;
 if(f.minimum!==null&&cents(Math.abs(t.amount))<f.minimum)return false;
 if(f.maximum!==null&&cents(Math.abs(t.amount))>f.maximum)return false;
 if(exclusions.has('Advertising')&&category==='Advertising')return false;
 if(exclusions.has('shopify')&&normalize(t.merchant).includes('shopify'))return false;
 if(exclusions.has('credits')&&t.kind==='Credit / refund')return false;
 return true;
 }).sort(txSort(f));
 const map=new Map();let amountCents=0;
 for(const t of records){const category=reviewOverrides[t.id]?.category||t.category;const key=f.groupBy==='month'?t.date.slice(0,7):f.groupBy==='category'?category:f.groupBy==='card'?t.card:f.groupBy==='none'?'All':t.merchant;let g=map.get(key);if(!g){g={name:key,amountCents:0,count:0};map.set(key,g)}g.amountCents+=cents(t.amount);g.count++;amountCents+=cents(t.amount)}
 const groups=[...map.values()].sort((a,b)=>b.amountCents-a.amountCents).map(v=>({...v,amount:v.amountCents/100}));
 return {filters:f,count:records.length,total:amountCents/100,groups,rows:records.slice(0,f.limit||100).map(t=>({id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card,category:reviewOverrides[t.id]?.category||t.category,purpose:reviewOverrides[t.id]?.purpose||t.purpose,kind:t.kind,source:t.source,sourceRow:t.sourceRow})),truncated:records.length>(f.limit||100),dateCoverage:'2026-01-01 to 2026-10-09'};
}

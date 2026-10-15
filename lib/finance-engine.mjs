// Budgeting Everything v3: financial facts come from the ledger, not model text.
export const DATA_START='2026-01-01';
export const DATA_END='2026-10-09';
export const categories=['Advertising','Insurance','Dining / delivery','Shopping / household','Shopping / leisure','Legal','Business software / services','Transport / auto','Inventory / suppliers','Entertainment / subscriptions','Card fees','Other / uncategorized'];
export const DEFAULT_FILTERS={mode:'transactions',kind:'Charge',start:DATA_START,end:DATA_END,minCents:null,maxCents:null,merchant:'',excludedMerchants:[],excludedCategories:[],category:'',card:'',purpose:'',sort:'largest',groupBy:'category'};
const DATE=/^2026-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const iso=d=>d.toISOString().slice(0,10);
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const safeInt=v=>Number.isSafeInteger(v)?v:null;
export const cents=n=>Math.round(Number(n||0)*100);
export const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export function validDate(s){return typeof s==='string'&&DATE.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&iso(new Date(s+'T00:00:00Z'))===s}
export function dayOffset(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d)}
export function monthOffset(date,n){const [y,m,day]=date.split('-').map(Number), d=new Date(Date.UTC(y,m-1+n,1));const cap=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(cap,day));return iso(d)}
function monthNum(s){return ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex(x=>x.startsWith(s.toLowerCase().slice(0,3)))+1}
function namedDate(mon,day,year=2026){const m=monthNum(mon);const d=`${year}-${String(m).padStart(2,'0')}-${String(+day).padStart(2,'0')}`;return validDate(d)?d:null}
function lastOfMonth(mon){const m=monthNum(mon);return iso(new Date(Date.UTC(2026,m,0)))}
export function sanitizeFilters(raw={}){
 const p=raw&&typeof raw==='object'?raw:{}, f={...DEFAULT_FILTERS};
 if(['transactions','refunds','receipts','savings','compare'].includes(p.mode))f.mode=p.mode;
 if(['Charge','Credit / refund','Payment','All'].includes(p.kind))f.kind=p.kind;
 if(validDate(p.start))f.start=p.start;if(validDate(p.end))f.end=p.end;
 for(const key of ['minCents','maxCents'])if(p[key]===null||p[key]===undefined)f[key]=null;else if(safeInt(p[key])!==null&&p[key]>=0&&p[key]<1000000000)f[key]=p[key];
 for(const key of ['merchant','category','card','purpose'])if(typeof p[key]==='string')f[key]=p[key].slice(0,140).trim();
 for(const key of ['excludedMerchants','excludedCategories'])if(Array.isArray(p[key]))f[key]=[...new Set(p[key].filter(x=>typeof x==='string').map(x=>x.trim().slice(0,100)).filter(Boolean))].slice(0,20);
 if(['largest','newest','oldest','smallest'].includes(p.sort))f.sort=p.sort;
 if(['merchant','category','month','card','purpose'].includes(p.groupBy))f.groupBy=p.groupBy;
 return f;
}
const RE_MONTH='(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
// Deterministic fallback and safeguards applied to every AI-generated query plan.
export function interpretLocal(question,previous={},asOf='2026-10-11'){
 const text=String(question||'').trim(),q=text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?=\s+(?:days?|weeks?|months?))/g, m=>String(['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'].indexOf(m)+1)),prev=sanitizeFilters(previous);let f={...prev,excludedMerchants:[...prev.excludedMerchants],excludedCategories:[...prev.excludedCategories]},changes=[];
 const reset=/\b(start over|reset|clear (all )?filters|new search)\b/.test(q);
 if(reset){f=sanitizeFilters();changes.push('Reset search');}
 const hasRefund=/\b(refunds?|credits?|returns?|reimbursements?|chargebacks?)\b/.test(q), hasPurchase=/\b(charges?|purchases?|expenses?|transactions?|spent|spending|payments?)\b/.test(q);
 const excludingCredits=/\b(ignore|exclude|without|not including|skip)\s+(?:\w+\s+){0,3}(?:credits?|refunds?)\b/.test(q);
 if(/\b(why|suggest|save|savings|reduce|cut back|budget|better with money|afford)\b/.test(q)) {f.mode='savings';if(hasPurchase)f.kind='Charge';changes.push('Savings analysis');}
 else if(/\b(receipts?|items?|products?|what did i buy|what i bought|ordered)\b/.test(q)){f.mode='receipts';f.kind='Charge';changes.push('Receipt evidence');}
 else if(/\b(compare|versus|vs\.?|difference between)\b/.test(q)){f.mode='compare';f.kind='Charge';changes.push('Comparison');}
 else if(hasRefund&&!excludingCredits&&!/\b(these|those|them|ones)\b.{0,65}\b(refunds?|refunded|credits?|credited|returned)\b|\b(which|were)\b.{0,30}\b(these|those)\b.{0,30}\b(refunds?|refunded|credits?|credited)/.test(q)&&(!hasPurchase||/\b(which|what|any|were|got|been)\b.{0,45}\brefund/.test(q))){f.mode='refunds';f.kind='Credit / refund';changes.push('Credits and refunds');}
 else if(/\b(charges?|purchases?|spending|spent|expenses?|transaction)\b/.test(q)){f.mode='transactions';f.kind='Charge';changes.push('Charges');}
 // Parse dates: explicit ISO range, dated months, relative calendar range, and "past" windows.
 const dates=[...text.matchAll(/\b2026-\d\d-\d\d\b/g)].map(x=>x[0]).filter(validDate);
 let dateChanged=false;
 if(dates.length>=2){f.start=dates[0];f.end=dates[1];dateChanged=true;}
 else if(dates.length===1&&/\b(on|for|date|during)\b/.test(q)){f.start=dates[0];f.end=dates[0];dateChanged=true;}
 if(!dateChanged){
  const before=q.match(new RegExp('\\b(\\d{1,3})\\s+days?\\s+before\\s+(?:the\\s+)?('+RE_MONTH+')\\s+(\\d{1,2})(?:st|nd|rd|th)?'));
  if(before){const end=namedDate(before[2],before[3]);if(end){f.end=end;f.start=dayOffset(end,-Number(before[1]));dateChanged=true;}}
 }
 if(!dateChanged){
  const between=q.match(new RegExp('\\b(?:from|between)\\s+('+RE_MONTH+')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:,?\\s*2026)?\\s*(?:to|through|and|-)\\s*('+RE_MONTH+')\\s+(\\d{1,2})(?:st|nd|rd|th)?'));
  if(between){const a=namedDate(between[1],between[2]),b=namedDate(between[3],between[4]);if(a&&b){f.start=a;f.end=b;dateChanged=true;}}
 }
 if(!dateChanged){const r=q.match(/\b(?:last|past|previous|recent)\s+(\d+)\s+(days?|weeks?|months?)\b/);
  if(r){const today=validDate(asOf)?asOf:DATA_END;const n=Math.min(+r[1],120);f.end=today;f.start=r[2].startsWith('month')?monthOffset(today,-n):dayOffset(today,r[2].startsWith('week')?-7*n:-n);dateChanged=true;}
  else if(/\b(recently|lately|the last couple months|past couple months)\b/.test(q)){const today=validDate(asOf)?asOf:DATA_END;f.end=today;f.start=monthOffset(today,-2);dateChanged=true;}
 }
 if(!dateChanged){
  const mon=q.match(new RegExp('\\b(?:in|during|for|of)\\s+('+RE_MONTH+')\\b'));
  if(mon){f.start=namedDate(mon[1],1);f.end=lastOfMonth(mon[1]);dateChanged=true;}
 }
 if(dateChanged)changes.push('Date scope');
 const gt=q.match(/\b(?:above|over|greater than|more than|exceed(?:ing)?|larger than)\s*\$?([\d,]+(?:\.\d{1,2})?)/);
 const ge=q.match(/\b(?:at least|minimum(?: of)?|\$)(?:\s*)\$?([\d,]+(?:\.\d{1,2})?)\s*(?:\+|or more)\b/);
 if(gt){f.minCents=cents(Number(gt[1].replaceAll(',','')))+1;changes.push('Minimum >');}
 else if(ge){f.minCents=cents(Number(ge[1].replaceAll(',','')));changes.push('Minimum ≥');}
 if(/\b(no minimum|any amount|remove (the )?(minimum|amount) filter)\b/.test(q))f.minCents=null;
 const lt=q.match(/\b(?:under|below|less than)\s*\$?([\d,]+(?:\.\d{1,2})?)/);
 if(lt){f.maxCents=cents(Number(lt[1].replaceAll(',','')))-1;changes.push('Maximum <');}
 // Merchant/category exclusions are modifications to the previous query, never a new query.
 const omit=/\b(ignore|exclude|without|except|not including|remove|leave out|skip)\b/.test(q);
 const include=/\b(include|add back|allow|stop excluding)\b/.test(q);
 const exclusions=[['advertising', 'category','Advertising'],['ads','category','Advertising'],['shopify','merchant','shopify'],['insurance','category','Insurance'],['amazon','merchant','amazon'],['dining','category','Dining / delivery'],['software','category','Business software / services']];
 for(const [word,kind,val] of exclusions){if(!new RegExp('\\b'+word+'\\b').test(q))continue;
  if(omit){const key=kind==='category'?'excludedCategories':'excludedMerchants';if(!f[key].includes(val))f[key].push(val);changes.push('Excluded '+val);}
  else if(include){const key=kind==='category'?'excludedCategories':'excludedMerchants';f[key]=f[key].filter(x=>x!==val);changes.push('Included '+val);}
 }
 if(/\bonly (?:my )?(?:personal|business)\b|\b(?:personal|business) (?:expenses?|spending|purchases?|charges?)\b/.test(q)){f.purpose=/\bpersonal\b/.test(q)?'Personal':'Business';changes.push('Purpose filter');}
 if(/\b(?:both|all) (?:personal and business|cards)\b|\bremove purpose filter\b/.test(q))f.purpose='';
 if(/\b(?:gold|business) card\b/.test(q)){f.card=q.includes('gold card')?'Gold Card':'Business Card';changes.push('Card');}
 if(/\b(?:at|from|with)\s+(amazon|target|costco|walmart|walgreens|starbucks|uber|instacart|geico|spotify|etsy)\b/.test(q)&&!omit){f.merchant=q.match(/\b(?:at|from|with)\s+(amazon|target|costco|walmart|walgreens|starbucks|uber|instacart|geico|spotify|etsy)\b/)[1];changes.push('Merchant');}
 if(/\b(?:all merchants|remove merchant filter|all stores)\b/.test(q))f.merchant='';
 if(/\b(by merchant|biggest merchants|top merchants|which merchants|stores)\b/.test(q))f.groupBy='merchant';
 else if(/\b(by month|each month|monthly|month by month)\b/.test(q))f.groupBy='month';
 else if(/\b(by category|categories|category breakdown|where is my spending)\b/.test(q))f.groupBy='category';
 if(/\b(newest|most recent|latest charges)\b/.test(q))f.sort='newest';
 else if(/\b(oldest|earliest)\b/.test(q))f.sort='oldest';
 else if(/\b(largest|biggest|top|highest|most expensive)\b/.test(q))f.sort='largest';
 return {filters:sanitizeFilters(f),changes};
}
const effective=(t,overrides={})=>({ ...t, category:overrides[t.id]?.category||t.category, purpose:overrides[t.id]?.purpose||t.purpose });
export function selectTransactions(transactions,filter,overrides={}){
 const f=sanitizeFilters(filter), excludedMerchants=f.excludedMerchants.map(clean), excludedCategories=f.excludedCategories.map(clean);
 const selected=transactions.filter(t=>{if(!t.inPeriod||t.date<f.start||t.date>f.end)return false;
  if(f.mode==='refunds'&&t.kind!=='Credit / refund')return false;
  if(f.mode!=='refunds'&&f.kind!=='All'&&t.kind!==f.kind)return false;
  const et=effective(t,overrides),merchant=clean(t.merchant);
  if(f.card&&t.card!==f.card||f.purpose&&et.purpose!==f.purpose||f.category&&et.category!==f.category||f.merchant&&!merchant.includes(clean(f.merchant)))return false;
  if(excludedCategories.some(c=>clean(et.category)===c)||excludedMerchants.some(m=>merchant.includes(m)))return false;
  const amount=Math.abs(cents(t.amount));if(f.minCents!==null&&amount<f.minCents||f.maxCents!==null&&amount>f.maxCents)return false;
  return true;}).map(t=>effective(t,overrides));
 selected.sort((a,b)=>{if(f.sort==='newest')return b.date.localeCompare(a.date)||b.amount-a.amount;
 if(f.sort==='oldest')return a.date.localeCompare(b.date)||b.amount-a.amount;
 if(f.sort==='smallest')return Math.abs(a.amount)-Math.abs(b.amount);
 return Math.abs(b.amount)-Math.abs(a.amount)||a.date.localeCompare(b.date);});return selected;
}
function aggregate(rows,field){const groups=new Map();for(const t of rows){let key=field==='month'?t.date.slice(0,7):String(t[field]||'Uncategorized');let v=groups.get(key)||{name:key,count:0,cents:0};v.cents+=cents(t.amount);v.count++;groups.set(key,v)}return [...groups.values()].sort((a,b)=>Math.abs(b.cents)-Math.abs(a.cents)).map(g=>({name:g.name,count:g.count,amount:g.cents/100}));}
export function evidenceLookup(audit, rows, maxRecords=120){
 const orders=new Map(audit.orders.map(o=>[o.id,o]));const products=new Map(audit.products.map(p=>[p.id,p]));const results={};
 for(const t of rows.slice(0,maxRecords)){
  const links=(t.matches||[]).filter(m=>m.orderId).slice(0,8);
  if(!links.length)continue;
  const entries=[];for(const l of links){const o=orders.get(l.orderId);if(!o)continue;
   const status=(l.status||t.matchStatus||'').toLowerCase();const confidence=status.includes('reconciled')?'reconciled (card identity may be unverified)':'candidate — not proof of this charge';
   entries.push({orderId:o.id,retailer:o.retailer,orderDate:o.date,orderStatus:o.status,grandTotal:o.grandTotal,paymentMethod:o.paymentMethod,paymentVerified:o.paymentVerified,confidence,source:o.source,items:(o.products||[]).slice(0,15).map(id=>products.get(id)).filter(Boolean).map(p=>({description:p.description,quantity:p.quantity,amount:p.netAmount,category:p.category,status:p.status,verification:p.verification})),note:'Receipt details are supporting evidence only; never add order totals to Amex charge totals.'});
  }if(entries.length)results[t.id]=entries;
 }return results;
}
export function refundMatches(audit,filters){
 const f=sanitizeFilters(filters),txById=new Map(audit.transactions.map(t=>[t.id,t]));const result=[];
 for(const r of audit.refundReview.rows){const credit=txById.get(r.id);if(!credit||credit.date<f.start||credit.date>f.end)continue;
 const et=(credit.merchant||'').toLowerCase();if(f.card&&credit.card!==f.card||f.excludedMerchants.some(m=>et.includes(m.toLowerCase())))continue;
 if(f.minCents!==null&&Math.abs(cents(credit.amount))<f.minCents)continue;
 const purchase=r.linkedPurchaseId?txById.get(r.linkedPurchaseId):null;
 const status=r.creditType!=='Merchant credit / refund'?'nonpurchase':purchase?'confirmed':String(r.linkStatus).startsWith('Ambiguous')?'ambiguous':String(r.linkStatus).startsWith('Candidate')?'possible':'unlinked';
 result.push({credit:{id:credit.id,date:credit.date,merchant:credit.merchant,amount:credit.amount,card:credit.card,source:credit.source,sourceRow:credit.sourceRow},type:r.creditType,status,description:r.linkStatus,purchase:purchase?{id:purchase.id,date:purchase.date,merchant:purchase.merchant,amount:purchase.amount,card:purchase.card,source:purchase.source,sourceRow:purchase.sourceRow}:null,candidates:(r.candidatePurchaseIds||[]).map(id=>txById.get(id)).filter(Boolean).map(t=>({id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card})),net:purchase?Math.round((purchase.amount+credit.amount)*100)/100:null});
 }
 return result.sort((a,b)=>b.credit.date.localeCompare(a.credit.date));
}
export function receiptLibrary(audit,filters){
 const f=sanitizeFilters(filters),products=new Map(audit.products.map(p=>[p.id,p]));
 const orders=audit.orders.filter(o=>o.date>=f.start&&o.date<=f.end && o.amex===true && o.paymentVerified===true && (!f.merchant||clean(o.retailer).includes(clean(f.merchant))) && !f.excludedMerchants.some(m=>clean(o.retailer).includes(clean(m))));
 return orders.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,90).map(o=>({id:o.id,retailer:o.retailer,date:o.date,status:o.status,grandTotal:o.grandTotal,subtotal:o.subtotal,paymentMethod:o.paymentMethod,paymentVerified:o.paymentVerified,source:o.source,items:(o.products||[]).slice(0,30).map(id=>products.get(id)).filter(Boolean).map(p=>({description:p.description,quantity:p.quantity,netAmount:p.netAmount,status:p.status,verification:p.verification})),note:'Verified payment method on retailer evidence; individual Amex transaction linkage may still be provisional. Order amounts are not added to card charges.'}));
}
export function analyze(audit,filters,overrides={},opts={}){
 const f=sanitizeFilters(filters);const all=selectTransactions(audit.transactions,f,overrides);
 const sumCents=all.reduce((s,t)=>s+cents(t.amount),0),pageSize=40,page=Math.max(1,Math.min(2000,Math.floor(Number(opts.page)||1))),pageCount=Math.max(1,Math.ceil(all.length/pageSize));
 const pageRows=all.slice((Math.min(page,pageCount)-1)*pageSize,Math.min(page,pageCount)*pageSize);
 const grandByCategory=aggregate(all,'category'),grandByMerchant=aggregate(all,'merchant'),grandByMonth=aggregate(all,'month');
 const grouped=f.groupBy==='merchant'?grandByMerchant:f.groupBy==='month'?grandByMonth:f.groupBy==='card'?aggregate(all,'card'):f.groupBy==='purpose'?aggregate(all,'purpose'):grandByCategory;
 const credits=f.mode==='refunds'?refundMatches(audit,f):null;const creditCounts=credits?Object.fromEntries(['confirmed','possible','ambiguous','unlinked','nonpurchase'].map(k=>[k,credits.filter(r=>r.status===k).length])):null;
 const warnings=[];if(f.end>DATA_END)warnings.push(`Your records stop on ${DATA_END}. Dates after that are not covered.`);
 if(f.start<DATA_START)warnings.push(`Your records start on ${DATA_START}. Earlier transactions are unavailable.`);
 if(all.some(t=>t.purpose)&&f.purpose)warnings.push('Personal/business classifications are provisional and may need review.');
 if(f.mode==='receipts')warnings.push('Receipt evidence covers only a subset of retailers and transactions; products must not be double-counted as additional spending.');
 if(f.mode==='refunds')warnings.push('A posted merchant credit does not automatically prove a returned item, or identify its original purchase.');
 const scope={start:f.start,end:f.end,kind:f.mode==='refunds'?'Credit / refund':f.kind};
 const result={filters:f,scope,count:all.length,total:sumCents/100,groups:grouped.slice(0,100),topMerchants:grandByMerchant.slice(0,20),categories:grandByCategory,months:grandByMonth,rows:pageRows.map(t=>({id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card,kind:t.kind,category:t.category,purpose:t.purpose,source:t.source,sourceRow:t.sourceRow,originalCategory:t.original?.Category||'',matchStatus:t.matchStatus})),receipts:(f.mode==='receipts'||opts.withReceipts)?evidenceLookup(audit,pageRows):{},receiptOrders:f.mode==='receipts'?receiptLibrary(audit,f):null,refunds:credits,creditCounts,page:Math.min(page,pageCount),pageCount,pageSize,warnings,dataEnd:DATA_END};
 if(f.mode==='savings')result.savings=makeSavings(result,all,audit);
 return result;
}
export function makeSavings(result,all,audit){
 const rows=result.categories.filter(g=>g.amount>0),suggestions=[];
 for(const x of rows){let pct=null,reason='';if(x.name==='Dining / delivery'){pct=.15;reason='Optional 15% reduction scenario for delivery and dining.'}
 else if(x.name==='Shopping / leisure'){pct=.15;reason='Optional 15% reduction scenario for leisure shopping.'}
 else if(x.name==='Entertainment / subscriptions'){pct=.1;reason='Optional 10% review scenario for subscriptions.'}
 if(pct){const estimated=Math.round(x.amount*pct*100)/100;suggestions.push({category:x.name,observed:x.amount,scenarioSavings:estimated,assumption:reason,certainty:'Illustrative scenario, not verified waste or guaranteed savings.'})}}
 const rec=[];for(const r of audit.recurringMerchants||[]){const ids=new Set(r.sourceIds||[]),matched=all.filter(t=>ids.has(t.id));if(!matched.length)continue;
 rec.push({merchant:r.merchant,matchedCount:matched.length,scopeAmount:matched.reduce((n,t)=>n+cents(t.amount),0)/100,monthCount:r.months,status:r.status});}
 rec.sort((a,b)=>b.scopeAmount-a.scopeAmount);
 return {scenarios:suggestions.sort((a,b)=>b.scenarioSavings-a.scenarioSavings),recurringCandidates:rec.slice(0,12),note:'These are illustrative spending-reduction scenarios; income, essential expenses, ROI, and all account balances are unknown. Advertising must be evaluated against business revenue/return, not treated automatically as waste.'};
}
export function defaultAnswer(result,question){
 const f=result.filters,range=`${f.start} through ${f.end}`;
 if(result.count===0)return `No ${f.mode==='refunds'?'credits':'charges'} matched the applied filters for ${range}. This does not establish that there were no other transactions.`;
 if(f.mode==='refunds'){const c=result.creditCounts||{};return `${result.count} posted credits (${money(Math.abs(result.total))}) during ${range}. Of these, ${c.confirmed||0} have confirmed purchase links, ${c.possible||0} have candidate links, ${c.ambiguous||0} have ambiguous links, ${c.unlinked||0} have no verified purchase match, and ${c.nonpurchase||0} are rewards, benefits or adjustments. These are posted credits—not automatically returned products. See each credit and its candidate charges below.`;}
 const rows=result.topMerchants.slice(0,4).map(r=>`${r.name}: ${money(r.amount)}`).join('; ');
 const basic=`${result.count} ${f.kind.toLowerCase()} records totaling ${money(result.total)} in ${range}. Largest matching merchants: ${rows}.`;
 if(f.mode==='receipts')return basic+' Expand the evidence on individual charges to see available products. An unmatched receipt does not prove that you purchased a specific product with this card.';
 if(f.mode==='savings')return basic+' The savings scenarios below are estimates for review, not statements of unnecessary spending.';
 return basic+' The table below contains the exact matching records and source IDs, with all matching transactions counted in the total.';
}

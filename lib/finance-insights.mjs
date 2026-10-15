import {selectTransactions,refundMatches,money,cents} from './finance-engine.mjs';

const normalized=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const similar=(a,b)=>{const x=normalized(a),y=normalized(b);return x.includes(y)||y.includes(x)};
const normalizeMerchant=s=>normalized(s).replace(/\b(aplpay|on erway|pwp|amex|com|ca|wa|gb|il)\b/g,'').trim();
// A merchant selling clothing does not establish the particular items on a given receipt.
const rules=[
 {test:/\bOPENBUY\b/i,category:'Clothing / apparel',confidence:'user-confirmed merchant category',why:'You identified OpenBuy as clothing; specific garment is not verified'},
 {test:/ARITZIA|UNIQLO|ZARA\b|H\s*&\s*M\b|NORDSTROM|FASHION NOVA|ASOS\b/i,category:'Clothing / apparel',confidence:'clothing retailer',why:'Clothing-focused retailer; precise item needs a receipt'},
 {test:/T\.?J\.?\s*MAXX|ROSS\b|MARSHALLS|BURLINGTON\b/i,category:'Potential clothing purchase',confidence:'mixed-category retailer',why:'Store sells clothing and other merchandise; card description does not identify items'},
 {test:/\bTARGET\b|WALMART|COSTCO\b/i,category:'Potential clothing purchase',confidence:'mixed-category retailer',why:'Store sells clothing but the charge could be groceries or household items'}
];
export function merchantClass(merchant,userPrefs={}){
 const cleaned=normalized(merchant);const prefs=userPrefs&&typeof userPrefs==='object'?Object.entries(userPrefs):[];
 for(const [key,v] of prefs){if(normalized(key)&&cleaned.includes(normalized(key))&&typeof v==='string'&&v.length<100)return {category:v,confidence:'your classification',why:'Saved merchant correction (specific products still unverified)'};}
 return rules.find(r=>r.test.test(merchant))||null;
}
function inferCorrection(question){
 const text=String(question||'');const m=text.match(/\b(?:also\s+)?([a-z][\w\s*-]{2,32}?)\s+is\s+(?:a\s+|for\s+)?(?:clothing|apparel|fashion)(?:\b|\s+just\s+for)/i);
 if(!m)return null;let key=m[1].replace(/^(also|and|just|note|that)\s+/i,'').trim();if(/\b(open\s*buy|openbuy)\b/i.test(key))key='OPENBUY';
 return key&&key.length<=36?{merchant:key,category:'Clothing / apparel'}:null;
}
export function detectFocus(question){
 const q=String(question||'').toLowerCase();const clothing=/\b(clothing|clothes|apparel|wear|fashion|garments?|outfits?)\b/.test(q)&&/\b(which|what|related|of these|ones|show|spend|expense|charges?|is)\b/.test(q);
 const detail=/\b(what exactly|what is this charge|what was this charge|tell me (?:about|what)|explain (?:the|this) charge|what (?:are|is) (?:this|that) merchant|what did i buy)\b/.test(q);
 const refRefund=/\b(these|those|them|any of those|ones)\b.{0,70}\b(refund|returned|credited)\b|\b(which|were)\b.{0,60}\b(refunded|credited)\b/.test(q);
 const correction=inferCorrection(question);
 return {clothing,detail,refRefund,correction};
}
function identifyMerchant(question,rows){
 let q=normalized(question);const exactTravel=/AMEXTRAVEL\.CO/i.test(question);
 if(exactTravel)return rows.filter(t=>/PWP\s*AMEXTRAVEL\.CO/i.test(t.merchant));
 const alias=/\b(amex\s*travel|amextravel|pwp\s*amex|pay\s*with\s*points)\b/i.test(question)?/PWP\s*AMEX|AMEXTRAVEL\.CO/i:null;
 if(alias)return rows.filter(t=>alias.test(t.merchant));
 let after=String(question).split(/(?:what exactly is this charge|what is this charge|charge:|merchant:)/i).pop().trim().replace(/[?.!]+$/,'');
 if(after.length>7){const pattern=normalized(after).split(' ').filter(t=>t.length>=4).slice(0,4);let hits=rows.filter(t=>pattern.some(p=>normalized(t.merchant).includes(p)));if(hits.length)return hits;}
 const scored=rows.map(t=>{const tokens=normalized(t.merchant).split(' ').filter(x=>x.length>4&&!['payment','credit'].includes(x));return {t,s:tokens.filter(x=>q.includes(x)).length};}).filter(o=>o.s>0).sort((a,b)=>b.s-a.s);
 if(!scored.length)return [];return scored.filter(o=>o.s===scored[0].s).map(o=>o.t);
}
function offsetForCharge(charge,audit){
 const candidates=audit.transactions.filter(t=>t.kind==='Credit / refund'&&t.card===charge.card&&Math.abs(cents(t.amount)+cents(charge.amount))<=1&&Math.abs(Date.parse(t.date)-Date.parse(charge.date))<=3*86400000);
 return candidates.map(t=>({id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card,status:/PAY WITH POINTS CREDIT/i.test(t.merchant)?'points-credit candidate':'same-amount credit candidate',verification:'Amount/date/card match; card statement alone cannot prove an exact booking or refund relationship'})).slice(0,8);
}
export function buildInsights(question,audit,filters,overrides={},prefs={}){
 const focus=detectFocus(question),scope=selectTransactions(audit.transactions,filters,overrides),cards=[];
 let refined=[],responseMode='overview';const notes=[];
 if(focus.clothing){responseMode='clothing';const known=[],possible=[],notClothing=[];const orders=new Map(audit.orders.map(o=>[o.id,o]));const products=new Map(audit.products.map(p=>[p.id,p]));
  for(const t of scope){const c=merchantClass(t.merchant,prefs);if(!c)continue;const record={id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card,category:c.category,confidence:c.confidence,note:c.why};
  if(c.category==='Potential clothing purchase'){
   const proven=(t.matches||[]).filter(l=>/reconciled/i.test(l.status||'')).map(l=>orders.get(l.orderId)).filter(Boolean);
   const lines=proven.flatMap(o=>(o.products||[]).map(id=>products.get(id)).filter(Boolean));
   if(lines.length&&lines.every(p=>/^(Groceries|Produce|Meat, seafood, and poultry|Other expenses)$/i.test(p.category||''))){record.category='Groceries / food and fees';record.confidence='itemized receipt evidence';record.note='Matched retailer receipt lists groceries, food, tips, and/or fees, not clothing';notClothing.push(record);continue;}
  }
  (c.category==='Potential clothing purchase'?possible:known).push(record);}
  const total=known.reduce((v,t)=>v+cents(t.amount),0)/100;
  cards.push({type:'clothing',title:'Clothing-related charges in your current selection',known,possible,knownTotal:total,knownCount:known.length,possibleCount:possible.length,notClothing,scopeCount:scope.length,note:'Merchant type is not proof of what was purchased; mixed-category stores are shown separately. No assumed product details.'});
  refined=known;}
 if(focus.detail){responseMode=responseMode==='clothing'?'clothing-and-detail':'merchant-detail';const merchantRows=identifyMerchant(question,scope);
  if(merchantRows.length){const grouped=new Map();for(const t of merchantRows){const k=/AMEXTRAVEL|PWP AMEX/i.test(t.merchant)?'Amex Travel — Pay with Points':t.merchant;const ar=grouped.get(k)||[];ar.push(t);grouped.set(k,ar)}
   for(const [title,charges] of [...grouped.entries()].slice(0,3)){
    const pointCredit=/Amex Travel/i.test(title);cards.push({type:'merchant',title,charges:charges.map(t=>({id:t.id,date:t.date,merchant:t.merchant,amount:t.amount,card:t.card,category:t.category,source:t.source,sourceRow:t.sourceRow,offsetCandidates:offsetForCharge(t,audit)})),meaning:pointCredit?'“PwP” likely refers to Pay with Points through American Express Travel. A charge may have a separate points-redemption statement credit. This description does not identify whether the booking was a hotel, flight, or other travel purchase.':`Merchant description identifies the billing business, not the exact items or services.`,confirmation:pointCredit?'Amex Travel receipts, itinerary, or points redemption details are needed to identify the booking.':'An itemized receipt or merchant order history is needed to identify the purchase.'});
   }
  }else notes.push('No exact merchant descriptor could be tied to the current selection; try quoting the merchant or transaction ID.');
 }
 if(focus.refRefund){responseMode='charge-refunds';const credits=audit.refundReview.rows;const chargeRefunds=scope.flatMap(t=>{const hits=credits.filter(r=>r.linkedPurchaseId===t.id||(r.candidatePurchaseIds||[]).includes(t.id));return hits.map(r=>{const cr=audit.transactions.find(x=>x.id===r.id);return cr?{purchase:{id:t.id,date:t.date,merchant:t.merchant,amount:t.amount},credit:{id:cr.id,date:cr.date,merchant:cr.merchant,amount:cr.amount},confidence:r.linkedPurchaseId===t.id?'confirmed':'unverified candidate'}:null}).filter(Boolean)});
  cards.push({type:'charge-refunds',title:'Refund evidence for the selected charges',links:chargeRefunds.slice(0,100),scopeCount:scope.length,note:'Refunds can post outside the purchase-date range. A candidate link does not prove the specific returned item.'});
 }
 if(focus.correction)notes.push(`Merchant knowledge noted: ${focus.correction.merchant} is classified as ${focus.correction.category} based on your statement.`);
 return {responseMode,focus,notes,cards,scopeCount:scope.length,refinedCount:refined.length};
}

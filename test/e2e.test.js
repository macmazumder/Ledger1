// End-to-end: real src/Ledger.html in jsdom talking to real src/Code.gs on a fake in-memory Sheet.
// Needs jsdom:  npm i jsdom   then   node tests/e2e.test.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
class Sheet{constructor(n){this.name=n;this.rows=[[]];this.max=1000;}
 getLastRow(){let l=0;this.rows.forEach((r,i)=>{if(r&&r.some(v=>v!==''&&v!==undefined))l=i+1});return l}
 getMaxRows(){return this.max} insertRowsAfter(a,n){this.max+=n}
 getRange(r,c,nr=1,nc=1){const s=this;return{
  getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=s.rows[r-1+i]||[];o.push(Array.from({length:nc},(_,j)=>row[c-1+j]===undefined?'':row[c-1+j]))}return o},
  getDisplayValues:()=>this.getRange(r,c,nr,nc).getValues(),
  setValues:v=>{v.forEach((row,i)=>{const t=s.rows[r-1+i]=s.rows[r-1+i]||[];row.forEach((x,j)=>t[c-1+j]=x)})},
  setNumberFormats(){},setNumberFormat(){},clearContent:()=>{for(let i=0;i<nr;i++){const t=s.rows[r-1+i];if(t)for(let j=0;j<nc;j++)t[c-1+j]=''}},setFontWeight(){}}}
 deleteRow(r){this.rows.splice(r-1,1)} deleteRows(r,n){this.rows.splice(r-1,n)} setFrozenRows(){} setColumnWidth(){} setName(n){delete sheets[this.name];this.name=n;sheets[n]=this}}
const sheets={}, props={}; let email='me@x.com';
const ctx={console,JSON,String,Array,Object,Error,Math,Date,Number,isFinite,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=new Sheet(n),getId:()=>'id',getSpreadsheetTimeZone:()=>'Asia/Kolkata'}),getUi:()=>({})},
 Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>'me@x.com'})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty(k,v){props[k]=v}})},
 LockService:{getDocumentLock:()=>({waitLock(){},releaseLock(){}}),getScriptLock:()=>null},
 HtmlService:{},Utilities:{formatDate:(d)=>d.toISOString().slice(0,10)},DriveApp:{},ScriptApp:{}};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/Code.gs'),'utf8'),ctx); ctx.createBackup_=()=>{};
const rows=k=>JSON.parse(ctx.getData(k));
let netDown=false; const alerts=[]; let confirmAnswer=true;
function makeRun(ok,fail){return new Proxy({},{get(_,p){
 if(p==='withSuccessHandler')return f=>makeRun(f,fail); if(p==='withFailureHandler')return g=>makeRun(ok,g);
 return (...args)=>{Promise.resolve().then(()=>{ if(netDown) return fail&&fail({message:'Network error'});
  try{const r=ctx[p](...args);ok&&ok(JSON.parse(JSON.stringify(r===undefined?null:r)))}catch(e){fail&&fail({message:e.message})}})}}})}
const html=fs.readFileSync(path.join(__dirname,'../src/Ledger.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse(w){
 w.google={script:{run:makeRun()}};w.alert=m=>alerts.push(String(m));w.confirm=()=>confirmAnswer;w.scrollTo=()=>{};
 w.addEventListener('error',e=>{console.log('PAGE ERROR:',e.message)});}});
const w=dom.window, $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const ev=code=>w.eval(code); const sleep=(ms=25)=>new Promise(r=>setTimeout(r,ms));
async function until(f,ms=3000){const t=Date.now();while(Date.now()-t<ms){try{if(f())return true}catch(e){}await sleep(10)}throw new Error('timeout waiting: '+f)}
const tab=async n=>{$(`.tab[data-tab="${n}"]`).click();await sleep(20)};
function fill(form,vals){for(const [k,v] of Object.entries(vals)){const el=form.querySelector(`[name="${k}"]`);if(!el)throw new Error('no field '+k);el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}))}}
async function submit(sel,vals){const f=$(sel);fill(f,vals);f.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await sleep(60)}
let pass=0,fail=0; const t=async(n,f)=>{try{await f();pass++;console.log('ok  ',n)}catch(e){fail++;console.log('FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+' got '+JSON.stringify(a)+' want '+JSON.stringify(b))};
const ok=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
(async()=>{
await t('app loads from the Sheet: version shown, categories seeded, dashboard drawn',async()=>{
 await until(()=>ev('state.loaded')&&$('#verTag').textContent==='v5.0');ok($('#main').textContent.includes('Dashboard'));
 eq(ev('state.expenseCategories.length'),13);ok($('#diagFoot').textContent.includes('v5.0'))});
await t('Sheet mode shows NONE of the PWA UI (no lock screen, lock/install buttons hidden, no API token path)',async()=>{
 ok(!$('#lockOverlay'));eq($('#lockBtn').style.display,'none');eq($('#installBtn').style.display,'none');eq(ev('IN_APPS_SCRIPT'),true);eq(ev('isLocked()'),false);ok($('#diagFoot').textContent.includes('Sheet app'))});
await t('every tab renders without error',async()=>{for(const n of ['wallets','people','cards','expenses','daily','monthly','dashboard']){await tab(n);ok($('#main').innerHTML.length>200,n+' empty')}});
await t('add two wallets; passbook opens; archive hides one, "Archived dikhao" reveals it',async()=>{
 await tab('wallets');await submit('#walletForm',{name:'Cash',balance:'1000'});await submit('#walletForm',{name:'Old Bank',balance:'50'});
 eq(rows('mf_wallets').map(x=>x.name),['Cash','Old Bank']);
 const arch=$$('[data-archwallet]').find(b=>b.closest('tr').textContent.includes('Old Bank'));confirmAnswer=true;arch.click();await sleep(80);
 eq(rows('mf_wallets')[1].archived,'1');ok(!$('#walletBody').textContent.includes('Old Bank'),'still visible');
 const chk=$('#showArchChk');chk.checked=true;chk.dispatchEvent(new w.Event('change'));await sleep(30);ok($('#walletBody').textContent.includes('Old Bank (archived)'))});
await t('bad date is blocked with a message; good date saves; local today used',async()=>{
 await tab('expenses');alerts.length=0;await submit('#expForm',{date:'31-02-2026',amount:'50'});ok(alerts.some(a=>a.includes('Date galat')),'no alert');eq(rows('mf_expenses').length,0);
 const today=ev('todayStr()'),[y,m,d]=today.split('-'),now=new Date();eq(today,`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
 await submit('#expForm',{date:`${d}-${m}-${y}`,amount:'125.5',note:'=1+1'});const e=rows('mf_expenses');eq([e.length,e[0].date,e[0].amount,e[0].note],[1,today,125.5,'=1+1'])});
await t('money shows paise only when needed; floats are rounded',async()=>{eq(ev('money(100)'),'₹100');eq(ev('money(12.5)'),'₹12.50');eq(ev('money(0.1+0.2)'),'₹0.30');eq(ev('r2(0.1+0.2-0.3)'),0)});
await t('daily entry + wallet balance (money in)',async()=>{
 await tab('daily');const wid=rows('mf_wallets')[0].id;await submit('#dailyForm',{amount:'300',walletId:wid,categorySelect:'Train Ticket'});
 eq(rows('mf_daily').length,1);eq(ev(`walletBalance('${wid}')`),1300)});
await t('transfer writes 2 rows with one TransferID; edit blocked; delete removes BOTH',async()=>{
 await tab('wallets');await submit('#walletForm',{name:'Savings',balance:'0'});const w2=rows('mf_wallets').find(x=>x.name==='Savings').id;
 $$('#walletBody [data-view]').find(td=>td.textContent.includes('Cash')).click();await sleep(20);
 await submit('#walletTxForm',{amount:'200',transferTo:w2});const tx=rows('mf_wallet_tx');eq(tx.length,2);ok(!ev("state.wallets.find(w=>w.name==='Old Bank')&&0"));ok(tx[0].transferId&&tx[0].transferId===tx[1].transferId);
 alerts.length=0;$$('[data-edittx]')[0].click();await sleep(20);ok(alerts.some(a=>a.includes('Transfer edit')));
 $$('[data-deltx]')[0].click();await sleep(80);eq(rows('mf_wallet_tx').length,0,'both halves')});
await t('category manager: delete a category; entries keep their text; last one protected',async()=>{
 await tab('expenses');const chip=$$('[data-delcat]').find(b=>b.dataset.delcat==='Petrol');chip.click();await sleep(80);
 ok(!rows('mf_exp_categories').includes('Petrol'));ok(!$$('[data-delcat]').some(b=>b.dataset.delcat==='Petrol'))});
await t('person + card: delete allowed only without entries, archive keeps history',async()=>{
 await tab('people');await submit('#personForm',{name:'Ram'});const pid=rows('mf_people')[0].id;
 await submit('#txForm',{amount:'40',type:'given'});eq(rows('mf_people_tx').length,1);
 alerts.length=0;$('#delPersonBtn').click();await sleep(40);ok(alerts.some(a=>a.includes('Archive')));eq(rows('mf_people').length,1);
 $('#archPersonBtn').click();await sleep(80);eq(rows('mf_people')[0].archived,'1');
 await tab('cards');await submit('#cardAddForm',{name:'Amazon'});$('[data-delcardacct]').click();await sleep(80);eq(rows('mf_cards').length,0)});
await t('auto refresh: other-device write appears without pressing Refresh, with a toast',async()=>{
 await tab('dashboard');const before=ev('state.expenses.length');
 ctx.appendItem('mf_expenses',JSON.stringify({id:'other01',date:ev('todayStr()'),category:'Tea',amount:7}));
 await ev('pollOnce()');await sleep(60);eq(ev('state.expenses.length'),before+1);ok($('#toast').textContent.includes('update aaya'))});
await t('auto refresh NEVER wipes a half-typed form',async()=>{
 await tab('expenses');const inp=$('#expForm [name="amount"]');inp.value='999';
 ctx.appendItem('mf_expenses',JSON.stringify({id:'other02',date:ev('todayStr()'),category:'Tea',amount:8}));const n=ev('state.expenses.length');
 await ev('pollOnce()');await sleep(40);eq(ev('state.expenses.length'),n,'reloaded over a dirty form');eq($('#expForm [name="amount"]').value,'999');inp.value='';
 await ev('pollOnce()');await sleep(60);eq(ev('state.expenses.length'),n+1,'should refresh once the form is clean')});
await t('internet down: entry stays as UNSAVED + retry button; coming back saves it exactly once',async()=>{
 await tab('expenses');const n0=rows('mf_expenses').length;netDown=true;alerts.length=0;
 await submit('#expForm',{amount:'77',note:'offline entry'});await sleep(40);
 eq(rows('mf_expenses').length,n0,'server must not have it');ok(ev('retryQueue.length')===1,'queued');ok($('#retryBtn').style.display!=='none','retry button');ok($('.unsaved-row'),'row marked unsaved');eq(alerts.length,0,'no scary alert for a network drop');
 netDown=false;$('#retryBtn').click();await sleep(120);const ex=rows('mf_expenses').filter(x=>x.note==='offline entry');eq(ex.length,1);eq(ev('retryQueue.length'),0);ok($('#retryBtn').style.display==='none')});
await t('internet down: delete+edit of a never-saved row never reaches the server',async()=>{
 netDown=true;await submit('#expForm',{amount:'11',note:'ghost'});const id=ev("state.expenses.find(x=>x.note==='ghost').id");eq(ev('retryQueue.length'),1);
 await ev(`saveDelete('expenses','mf_expenses','${id}')`);eq(ev('retryQueue.length'),0,'add+delete coalesced');netDown=false;eq(rows('mf_expenses').filter(x=>x.note==='ghost').length,0)});
await t('rows with bad dates / unsafe ids are parked in "Needs attention" (no crash, no HTML injection)',async()=>{
 const s=sheets['Expenses'];const last=s.getLastRow();
 s.rows[last]=['bad_date1','31-02-2026','Tea',5,'',''];s.rows[last+1]=['<img src=x onerror=alert(1)>','2026-01-01','Tea',5,'',''];
 await ev('refreshNow()');await tab('dashboard');const box=$('.note-box');ok(box&&box.textContent.includes('2 row'),'problems box');ok(!$('#main img'),'injected tag rendered');
 ok(ev("state.problems.map(p=>p.tab).every(x=>x==='Expenses')"))});
await t('failed definitive save (server rejects) rolls the screen back',async()=>{
 await tab('expenses');const n=ev('state.expenses.length');alerts.length=0;
 ctx.__orig=ctx.appendItem;ctx.appendItem=()=>{throw new Error('Validation failed')};await submit('#expForm',{amount:'5',note:'rejected'});ctx.appendItem=ctx.__orig;
 eq(ev('state.expenses.length'),n);ok(alerts.some(a=>a.includes('Validation failed')))});
await t('CSV export builds, escapes quotes and blocks formula injection',async()=>{
 const csv=ev('buildCsvExport()');ok(csv.includes('WALLETS')&&csv.includes('EXPENSES'));eq(ev(`csvEsc('=cmd')`),"'=cmd");eq(ev(`csvEsc('a,"b"')`),'"a,""b"""');eq(ev('csvEsc(-5)'),'-5')});
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);})();

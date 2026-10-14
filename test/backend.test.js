// Backend tests (Phase 1 + 2) against a fake in-memory Sheet. Run: node tests/backend.test.js
const fs=require('fs'), vm=require('vm'), path=require('path');
class Sheet{constructor(n){this.name=n;this.rows=[[]];this.max=1000;this.ops=[];this.fmt={};}
 getLastRow(){let l=0;this.rows.forEach((r,i)=>{if(r&&r.some(v=>v!==''&&v!==undefined))l=i+1});return l}
 getMaxRows(){return this.max} insertRowsAfter(a,n){this.max+=n}
 getRange(r,c,nr=1,nc=1){const s=this;const chk=()=>{if(r+nr-1>s.max)throw new Error('out of grid')};return{
  getValues:()=>{chk();const o=[];for(let i=0;i<nr;i++){const row=s.rows[r-1+i]||[];o.push(Array.from({length:nc},(_,j)=>row[c-1+j]===undefined?'':row[c-1+j]))}return o},
  getDisplayValues:()=>{chk();const o=[];for(let i=0;i<nr;i++){const row=s.rows[r-1+i]||[];o.push(Array.from({length:nc},(_,j)=>{const v=row[c-1+j];return v===undefined?'':(v&&v._disp)||String(v)}))}return o},
  setValues:v=>{chk();s.ops.push({op:'val',r,nr});v.forEach((row,i)=>{const t=s.rows[r-1+i]=s.rows[r-1+i]||[];row.forEach((x,j)=>t[c-1+j]=x)})},
  setNumberFormats:f=>{s.ops.push({op:'fmt',r,nr,f:f[0]})},setNumberFormat(){},
  clearContent:()=>{for(let i=0;i<nr;i++){const t=s.rows[r-1+i];if(t)for(let j=0;j<nc;j++)t[c-1+j]=''}},setFontWeight(){}}}
 deleteRow(r){this.rows.splice(r-1,1)} deleteRows(r,n){this.rows.splice(r-1,n)} setFrozenRows(){} setColumnWidth(){} setName(n){delete sheets[this.name];this.name=n;sheets[n]=this}}
const sheets={}, props={}, cacheStore={}; let email='me@x.com', backups=0, lockOk=true;
const ctx={console,JSON,String,Array,Object,Error,Math,Date,Number,isFinite,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=new Sheet(n),getId:()=>'id',getSpreadsheetTimeZone:()=>'Asia/Kolkata'}),getUi:()=>({})},
 Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>'me@x.com'})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty(k,v){props[k]=v}})},
 LockService:{getDocumentLock:()=>({waitLock(){if(!lockOk)throw new Error('x')},releaseLock(){}}),getScriptLock:()=>null},
 HtmlService:{createHtmlOutput:s=>mkOut(s),createHtmlOutputFromFile:f=>mkOut('file:'+f),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}},
 CacheService:{getScriptCache:()=>({get:k=>cacheStore[k]===undefined?null:cacheStore[k],put:(k,v)=>{cacheStore[k]=v},remove:k=>{delete cacheStore[k]},removeAll:ks=>ks.forEach(k=>delete cacheStore[k])})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({content:t,setMimeType(){return this},getContent(){return this.content}})},
 Utilities:{formatDate:(d)=>d.toISOString().slice(0,10),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
  computeDigest:(a,v)=>Array.from(require('crypto').createHash('sha256').update(v).digest()).map(b=>b>127?b-256:b),getUuid:()=>require('crypto').randomUUID()},
 DriveApp:{},ScriptApp:{}};
function mkOut(src){return {src,title:'',metas:{},favicon:null,setTitle(t){this.title=t;return this},addMetaTag(k,v){this.metas[k]=v;return this},setFaviconUrl(u){this.favicon=u;return this}}}
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/Code.gs'),'utf8'),ctx);
ctx.createBackup_=()=>{backups++};
const run=s=>vm.runInContext(s,ctx), J=o=>JSON.parse(JSON.stringify(o)); let pass=0,fail=0;
const t=(n,f)=>{try{f();pass++;console.log('ok  ',n)}catch(e){fail++;console.log('FAIL',n,'->',e.message)}};
const throws=(f,m)=>{try{f()}catch(e){if(m&&!e.message.includes(m))throw new Error('wrong error: '+e.message);return}throw new Error('did not throw')};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+' got '+JSON.stringify(a)+' want '+JSON.stringify(b))};
const sub=(a,b,m)=>{for(const k of Object.keys(b))if(JSON.stringify(a[k])!==JSON.stringify(b[k]))throw new Error((m||'')+' '+k+': got '+JSON.stringify(a[k])+' want '+JSON.stringify(b[k]))};
const rows=k=>JSON.parse(run(`getData('${k}')`)), R=(code)=>J(run(code));

// ---------- Phase 1 ----------
t('unauthorised / empty email blocked everywhere',()=>{['getAllData()','getData("mf_wallets")','appendItem("mf_wallets","{}")','deleteItem("mf_wallets","a")','seedTestRows_'].slice(0,4).forEach(c=>{email='evil@x.com';throws(()=>run(c),'Access denied');email='';throws(()=>run(c),'Access denied')});email='me@x.com'});
t('validation: unknown key, bad JSON, non-object, missing id',()=>{throws(()=>run('appendItem("nope","{}")'),'Unknown');throws(()=>run('appendItem("mf_wallets","{bad")'),'Invalid JSON');throws(()=>run('appendItem("mf_wallets","[1]")'),'object');throws(()=>run('appendItem("mf_wallets","{\\"name\\":\\"x\\"}")'),'id missing')});
t('append/update/upsert/delete return {ok}',()=>{
 sub(R('appendItem("mf_wallets",JSON.stringify({id:"w1",name:"Cash",openingBalance:100}))'),{ok:true,duplicate:false});
 R('appendItem("mf_wallets",JSON.stringify({id:"w2",name:"Bank",openingBalance:5}))');
 sub(R('updateItem("mf_wallets","w1",JSON.stringify({id:"w1",name:"Cash2",openingBalance:7}))'),{ok:true});
 eq(R('updateItem("mf_wallets","zz",JSON.stringify({id:"zz"}))'),{ok:false,reason:'not_found'});
 eq(R('deleteItem("mf_wallets","nope")'),{ok:false,reason:'not_found'});
 eq(R('upsertItem("mf_monthly","m1",JSON.stringify({id:"m1",year:2026,month:"May",incomeBase:1,expenseBase:2}))').action,'added');
 eq(R('upsertItem("mf_monthly","m1",JSON.stringify({id:"m1",year:2026,month:"May",incomeBase:9,expenseBase:2}))').action,'updated');
 eq(rows('mf_wallets')[0].name,'Cash2')});
t('atomic transfer: bad 2nd item writes nothing; deleteByField removes both halves',()=>{
 throws(()=>run('appendItems("mf_wallet_tx",JSON.stringify([{id:"a1",walletId:"w1"},{walletId:"w2"}]))'),'id missing');eq(rows('mf_wallet_tx').length,0);
 run('appendItems("mf_wallet_tx",JSON.stringify([{id:"a1",walletId:"w1",type:"debit",amount:10,transferId:"T"},{id:"a2",walletId:"w2",type:"credit",amount:10,transferId:"T"},{id:"a3",walletId:"w1",type:"credit",amount:1}]))');
 sub(R('deleteByField("mf_wallet_tx","transferId","T")'),{ok:true,count:2});eq(rows('mf_wallet_tx').length,1)});
t('deleteWalletCascade',()=>{run('appendItem("mf_wallet_tx",JSON.stringify({id:"b1",walletId:"w2",type:"credit",amount:3}))');sub(R('deleteWalletCascade("w2")'),{ok:true,wallet:1,tx:1})});
t('empty overwrite refused; bulk needs flag; backup first; backup failure aborts',()=>{
 throws(()=>run('setData("mf_wallets","[]")'),'Refusing');throws(()=>run('setBulkData({mf_wallets:"[]"},{})'),'confirmReplace');
 backups=0;throws(()=>run('setBulkData({mf_wallets:"[]"},{confirmReplace:true})'),'Refusing');if(backups!==1)throw new Error('no backup');
 run('setBulkData({mf_wallets:JSON.stringify([{id:"x1",name:"A",openingBalance:1}])},{confirmReplace:true})');eq(rows('mf_wallets').length,1);
 ctx.createBackup_=()=>{throw new Error('no drive')};throws(()=>run('setBulkData({mf_wallets:JSON.stringify([{id:"q",name:"Z"}])},{confirmReplace:true})'),'Backup nahi');eq(rows('mf_wallets')[0].id,'x1');ctx.createBackup_=()=>{backups++}});
t('lock timeout -> clear error',()=>{lockOk=false;throws(()=>run('appendItem("mf_wallets",JSON.stringify({id:"zz",name:"n"}))'),'busy');lockOk=true});

// ---------- Phase 2 ----------
t('2.1 formats are set BEFORE values, text cols "@", number cols "General"',()=>{
 run('appendItem("mf_daily",JSON.stringify({id:"d1",date:"2026-09-12",time:"14:30",category:"Train Ticket",amount:100,walletId:"",note:"=1+1"}))');
 const o=sheets['Daily Income'].ops, v=o.length-1; eq(o[v].op,'val');eq(o[v-1].op,'fmt','fmt before val');
 eq(o[v-1].f,['@','@','@','@','General','@','@']);
 eq(rows('mf_daily')[0].note,'=1+1'); eq(rows('mf_daily')[0].date,'2026-09-12')});
t('2.1 numbers must be finite; text capped',()=>{throws(()=>run('appendItem("mf_daily",JSON.stringify({id:"d2",amount:"abc"}))'),'number');throws(()=>run('appendItem("mf_daily",JSON.stringify({id:"d3",note:"x".repeat(2001)}))'),'lamba')});
t('2.1 grid grows past 1000 rows; 5000+ rows stay correct',()=>{
 props.ALLOW_TEST_SEED='true';sub(R('seedTestRows_(5200)'),{ok:true,added:5200});
 const all=rows('mf_daily');eq(all.length,5201);if(!/^\d{4}-\d{2}-\d{2}$/.test(all[3000].date)||!/^\d{2}:\d{2}$/.test(all[3000].time))throw new Error('format');
 R('appendItem("mf_daily",JSON.stringify({id:"late",date:"2026-12-31",time:"09:05",amount:1,note:"+5 plus"}))');
 const l=rows('mf_daily').pop();eq([l.id,l.date,l.note],['late','2026-12-31','+5 plus']);
 sub(R('clearTestRows_()'),{ok:true,kept:2});props.ALLOW_TEST_SEED=''});
t('2.1 seed helpers refuse without the Script Property',()=>throws(()=>run('seedTestRows_(5)'),'ALLOW_TEST_SEED'));
t('2.1 read: auto-parsed Date cells come back as correct text (date by sheet tz, time from display)',()=>{
 const s=sheets['Daily Income'];const d=new Date('2026-09-12T00:00:00Z');const tm=Object.assign(new Date('1899-12-30T09:00:00Z'),{_disp:'2:30:00 PM'});
 s.rows[1]=['dx',d,tm,'Cat',5,'',''];const r=rows('mf_daily').find(x=>x.id==='dx');eq([r.date,r.time],['2026-09-12','14:30'])});
t('2.1 repairFormats_ rewrites those cells as text and reports count',()=>{const r=R('repairFormats_()');if(r.fixed<2)throw new Error(JSON.stringify(r));
 const row=sheets['Daily Income'].rows[1];eq([row[1],row[2]],['2026-09-12','14:30']);eq(R('repairFormats_()').fixed,0,'re-run is a no-op')});
t('2.2 duplicate id is not written twice (retry-safe); appendItems skips existing',()=>{
 const it='JSON.stringify({id:"dup1",walletId:"w1",type:"credit",amount:1})';
 eq(R(`appendItem("mf_wallet_tx",${it})`).duplicate,false);eq(R(`appendItem("mf_wallet_tx",${it})`).duplicate,true);
 eq(rows('mf_wallet_tx').filter(x=>x.id==='dup1').length,1);
 const r=R('appendItems("mf_wallet_tx",JSON.stringify([{id:"dup1",walletId:"w1"},{id:"dup2",walletId:"w1"}]))');eq([r.added,r.duplicate],[1,false])});
t('2.3 default categories seeded on the server when tabs are empty',()=>{
 const g=R('getAllData()');const ex=JSON.parse(g.mf_exp_categories),da=JSON.parse(g.mf_daily_categories);
 if(ex.length!==13||ex[0]!=='Tea'||da.length!==10||da[0]!=='Train Ticket')throw new Error('seed');
 eq(R('addCategory("mf_exp_categories","  tea ")').added,false);eq(R('addCategory("mf_exp_categories","Bike Wash")').added,true);
 eq(JSON.parse(R('getAllData()').mf_exp_categories).length,14,'not re-seeded')});
t('2.4 onOpen no longer runs setup; tabs created lazily',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/Code.gs'),'utf8');const onOpen=src.slice(src.indexOf('function onOpen'),src.indexOf('function showLedgerDialog'));
 if(/setupSheets_\(\)/.test(onOpen)||/autoResizeColumn\(/.test(src))throw new Error('slow setup still present');
 delete sheets['Expenses'];R('appendItem("mf_expenses",JSON.stringify({id:"e1",date:"2026-10-01",category:"Tea",amount:12}))');eq(rows('mf_expenses').length,1)});

// ---------- Phase 3 ----------
t('3.4 unsafe ids rejected everywhere (<img onerror>, quotes, spaces)',()=>{
 ['<img src=x onerror=alert(1)>','a"b','a b','a'.repeat(41)].forEach(bad=>{
  throws(()=>run(`appendItem("mf_wallets",JSON.stringify({id:${JSON.stringify(bad)},name:"x"}))`),'Invalid id');
  throws(()=>run(`updateItem("mf_wallets",${JSON.stringify(bad)},JSON.stringify({id:"okid01"}))`),'Invalid id');
  throws(()=>run(`deleteItem("mf_wallets",${JSON.stringify(bad)})`),'Invalid id')});
 R('appendItem("mf_wallets",JSON.stringify({id:"Ok_id-9",name:"ok"}))')});
t('3.1 server rejects impossible dates / bad times, accepts real ones',()=>{
 const bad=['2026-02-31','2026-13-01','12-09-2026','1999-01-01','2101-01-01','2026-1-1'];
 bad.forEach(d=>throws(()=>run(`appendItem("mf_expenses",JSON.stringify({id:"ex${bad.indexOf(d)}abc",date:"${d}",amount:1}))`),'Date galat'));
 throws(()=>run('appendItem("mf_daily",JSON.stringify({id:"tmbad1",date:"2026-10-01",time:"25:00"}))'),'Time galat');
 R('appendItem("mf_expenses",JSON.stringify({id:"leap01",date:"2028-02-29",amount:1}))');throws(()=>run('appendItem("mf_expenses",JSON.stringify({id:"leap02",date:"2027-02-29",amount:1}))'),'Date galat')});
t('3.2 data version: bumps on real writes, not on duplicates; replies carry v; getAllData has __version',()=>{
 const v0=run('getDataVersion()');const a=R('appendItem("mf_expenses",JSON.stringify({id:"ver001",date:"2026-10-02",amount:5}))');
 eq(a.v,v0+1);eq(run('getDataVersion()'),v0+1);
 const d=R('appendItem("mf_expenses",JSON.stringify({id:"ver001",date:"2026-10-02",amount:5}))');eq([d.duplicate,d.v],[true,v0+1],'duplicate must not bump');
 eq(R('updateItem("mf_expenses","ver001",JSON.stringify({id:"ver001",date:"2026-10-02",amount:6}))').v,v0+2);
 eq(R('updateItem("mf_expenses","nothere",JSON.stringify({id:"nothere"}))').ok,false);eq(run('getDataVersion()'),v0+2,'failed write must not bump');
 eq(R('deleteItem("mf_expenses","ver001")').v,v0+3);eq(R('getAllData()').__version,String(v0+3));
 email='evil@x.com';throws(()=>run('getDataVersion()'),'Access denied');email='me@x.com'});
t('3.5 archived column is the LAST column and round-trips (wallet, person, card)',()=>{
 R('appendItem("mf_wallets",JSON.stringify({id:"arch01",name:"Old",openingBalance:0,archived:"1"}))');
 R('appendItem("mf_people",JSON.stringify({id:"per001",name:"Ram"}))');R('appendItem("mf_cards",JSON.stringify({id:"crd001",name:"Amazon",archived:"1"}))');
 eq(rows('mf_wallets').find(w=>w.id==='arch01').archived,'1');eq(rows('mf_people').find(p=>p.id==='per001').archived,null);eq(rows('mf_cards')[0].archived,'1');
 const cols=SC=>JSON.parse(run(`JSON.stringify(SCHEMA.${SC}.cols.map(c=>c.key))`));eq(cols('mf_wallets').pop(),'archived');eq(cols('mf_people').slice(0,2),['id','name'])});
t('3.5 deleteCategory: case-insensitive, entries untouched, last one protected',()=>{
 eq(R('addCategory("mf_exp_categories","Temp Cat")').added,true);
 eq(R('deleteCategory("mf_exp_categories","  temp CAT ")').ok,true);eq(R('deleteCategory("mf_exp_categories","temp cat")').reason,'not_found');
 R('appendItem("mf_expenses",JSON.stringify({id:"cat001",date:"2026-10-03",category:"Tea",amount:1}))');R('deleteCategory("mf_exp_categories","Tea")');
 eq(rows('mf_expenses').find(x=>x.id==='cat001').category,'Tea','existing entry keeps its category');
 throws(()=>run('deleteCategory("mf_wallets","x")'),'Not a category');
 ['Bike Wash','Petrol','Paper','Shop Rent','Medicine','Printer Ink','Electricity Bill','Internet Bill','Stationery','Xerox / Printing','Staff Salary','Other'].forEach(n=>run(`deleteCategory("mf_exp_categories",${JSON.stringify(n)})`));
 eq(rows('mf_exp_categories').length,1);eq(R('deleteCategory("mf_exp_categories","'+rows('mf_exp_categories')[0]+'")').reason,'last_category')});
t('3.5 old "Monthly Summary" tab is still read, then renamed by repair with data intact',()=>{
 const s=sheets['Monthly Manual Base'];delete sheets['Monthly Manual Base'];s.name='Monthly Summary';sheets['Monthly Summary']=s;
 const before=rows('mf_monthly');if(!before.length)throw new Error('legacy tab not read');
 R('repairFormats_()');if(sheets['Monthly Summary']||sheets['Monthly Manual Base']!==s)throw new Error('not renamed');eq(rows('mf_monthly'),before)});

// ---------- Phase 5: PWA API (doPost) ----------
const TOKEN='a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const api=(req,raw)=>JSON.parse(ctx.doPost({postData:{contents:raw!==undefined?raw:JSON.stringify(req)}}).getContent());
const auditRows=()=>{const s=sheets['Audit Log'];return s?s.rows.slice(1).filter(r=>r&&r[0]):[]};
t('5.1 API is DISABLED until a token exists',()=>{eq(api({t:TOKEN,a:'getVersion'}),{ok:false,error:'API disabled'})});
t('5.1 only the HASH of the token is stored (never the token)',()=>{run(`setApiToken_(${JSON.stringify(TOKEN)})`);
 eq(props.API_TOKEN_HASH.length,64);if(Object.values(props).some(v=>String(v).includes(TOKEN)))throw new Error('token stored in clear');eq(props.API_ENABLED,'true');
 throws(()=>run('setApiToken_("short")'),'too short')});
t('5.2 wrong / missing token => Unauthorized, logged as (auth), nothing readable',()=>{
 email='';eq(api({t:'nope',a:'getAllData'}),{ok:false,error:'Unauthorized'});eq(api({a:'getAllData'}).error,'Unauthorized');
 const a=auditRows();eq([a[0][1],a[0][2],a[0][3]],['(auth)','FAIL','unauthorized']);email='me@x.com'});
t('5.2 correct token works WITHOUT any Google login; reads are not logged, writes are',()=>{
 email='';const n0=auditRows().length;
 const all=api({t:TOKEN,a:'getAllData'});eq(all.ok,true);if(!all.result.mf_wallets)throw new Error('no data');
 eq(api({t:TOKEN,a:'getDataVersion'}).ok,true);eq(auditRows().length,n0,'reads must not be logged');
 const w=api({t:TOKEN,a:'appendItem',args:['mf_wallets',JSON.stringify({id:'apiw01',name:'ViaApi'})]});eq(w.ok,true);eq(w.result.duplicate,false);
 const l=auditRows();eq(l.length,n0+1);eq([l[n0][1],l[n0][2]],['appendItem','ok']);email='me@x.com';
 eq(rows('mf_wallets').some(x=>x.id==='apiw01'),true)});
t('5.2 setBulkData / setData / seed / repair / prototype tricks are NOT reachable',()=>{
 ['setBulkData','setData','seedTestRows_','clearTestRows_','repairFormats_','createBackup_','setApiToken_','constructor','__proto__','toString','doPost'].forEach(a=>{
  const r=api({t:TOKEN,a,args:['mf_wallets','[]',{confirmReplace:true}]});eq([a,r.ok,r.error],[a,false,'Unknown action'])});
 const l=auditRows();eq(l[l.length-1][2],'FAIL')});
t('5.2 API access never leaks: after (even failing) API calls, a normal call without login is denied',()=>{
 email='';api({t:TOKEN,a:'appendItem',args:['mf_wallets','{bad']});throws(()=>run('getAllData()'),'Access denied');
 api({t:TOKEN,a:'getAllData'});throws(()=>run('getAllData()'),'Access denied');email='me@x.com'});
t('5.2 server-side validation still applies through the API (unsafe id, impossible date, bad json)',()=>{
 eq(api({t:TOKEN,a:'appendItem',args:['mf_wallets',JSON.stringify({id:'<img onerror=1>',name:'x'})]}).error,'Invalid id');
 eq(api({t:TOKEN,a:'appendItem',args:['mf_expenses',JSON.stringify({id:'apie01',date:'2026-02-31',amount:1})]}).error.startsWith('Date galat'),true);
 eq(api({t:TOKEN,a:'appendItem',args:['mf_wallets','{bad']}).ok,false);eq(api({t:TOKEN,a:'appendItem',args:[1,2,3,4,5]}).error,'Too many arguments')});
t('5.2 bad requests: invalid JSON, non-object, empty, oversized',()=>{
 ['{bad','"str"','123','',undefined,'x'.repeat(1000001)].forEach(raw=>eq(api(null,raw===undefined?'':raw).error,'Bad request'));
 eq(JSON.parse(ctx.doPost({}).getContent()).error,'Bad request')});
t('5.3 rate limit: more than 120 requests/minute are refused',()=>{
 const m=Math.floor(Date.now()/60000);cacheStore['api_rate_'+m]='119';cacheStore['api_rate_'+(m+1)]='119';
 eq(api({t:TOKEN,a:'getVersion'}).ok,true);eq(api({t:TOKEN,a:'getVersion'}).error.startsWith('Rate limit'),true);delete cacheStore['api_rate_'+m];delete cacheStore['api_rate_'+(m+1)]});
t('5.3 10 wrong tokens => lockout (even the right token is refused) until cleared',()=>{
 for(let i=0;i<10;i++)api({t:'bad'+i,a:'getVersion'});eq(api({t:TOKEN,a:'getVersion'}).error.startsWith('Too many failed'),true);
 run('CacheService.getScriptCache().removeAll(["api_locked","api_fail"])');eq(api({t:TOKEN,a:'getVersion'}).ok,true)});
t('5.3 kill switch: DISABLE blocks a valid token instantly; rotate invalidates the old token',()=>{
 props.API_ENABLED='false';eq(api({t:TOKEN,a:'getVersion'}).error,'API disabled');props.API_ENABLED='true';eq(api({t:TOKEN,a:'getVersion'}).ok,true);
 const NEW='f'.repeat(64);run(`setApiToken_("${NEW}")`);eq(api({t:TOKEN,a:'getVersion'}).error,'Unauthorized');eq(api({t:NEW,a:'getVersion'}).ok,true);run(`setApiToken_("${TOKEN}")`)});
t('5.3 constant-time compare + audit log holds no ledger data and is trimmed',()=>{
 eq([run('safeEqual_("abc","abc")'),run('safeEqual_("abc","abd")'),run('safeEqual_("abc","abcd")'),run('safeEqual_("a",1)')],[true,false,false,false]);
 const s=sheets['Audit Log'];for(let i=0;i<2600;i++)s.rows.push(['t','x','ok','']);api({t:TOKEN,a:'appendItem',args:['mf_wallets',JSON.stringify({id:'trim01',name:'Secret Wallet Name',openingBalance:99999})]});
 if(s.rows.length>2400)throw new Error('not trimmed: '+s.rows.length);if(JSON.stringify(s.rows).includes('Secret Wallet Name')||JSON.stringify(s.rows).includes('99999'))throw new Error('ledger data in log')});
t('5.4 doGet: owner gets the app with mobile meta tags; other accounts get "Access denied"',()=>{
 const o=ctx.doGet({});eq(o.src,'file:Ledger');eq(o.metas['theme-color'],'#0F172A');eq(o.metas['apple-mobile-web-app-capable'],'yes');if(!/width=device-width/.test(o.metas.viewport)||!/viewport-fit=cover/.test(o.metas.viewport))throw new Error('viewport');
 props.PWA_ICON_URL='https://example.com/icons/favicon.svg';eq(ctx.doGet({}).favicon,'https://example.com/icons/favicon.svg');props.PWA_ICON_URL='http://insecure';eq(ctx.doGet({}).favicon,null);props.PWA_ICON_URL='';
 email='evil@x.com';if(!/Access denied/.test(ctx.doGet({}).src))throw new Error('not denied');email=''; if(!/Access denied/.test(ctx.doGet({}).src))throw new Error('anonymous not denied');email='me@x.com'});

console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);

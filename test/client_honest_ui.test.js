// Unit tests of the save / rollback / retry-queue block extracted from src/Ledger.html. Run: node tests/client_honest_ui.test.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../src/Ledger.html'),'utf8');
const honest=html.match(/\/\/ ==HONEST-UI-BEGIN==([\s\S]*?)\/\/ ==HONEST-UI-END==/)[1];
let pass=0,fail=0; const t=async(n,f)=>{try{await f();pass++;console.log('ok  ',n)}catch(e){fail++;console.log('FAIL',n,'->',e.message)}};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+' got '+JSON.stringify(a)+' want '+JSON.stringify(b))};
function env(){
  const log={renders:0,alerts:[],pendingAtRender:[],calls:[],resyncs:0}; const server={mode:'ok',reply:{ok:true}};
  const c={KEY2ARR:{mf_daily:'daily',mf_x:'daily'},console:{log(){},error(){}},Set,Object,Promise,JSON,Number,Array,String,RegExp,
   state:{loaded:true,dataVersion:5,wallets:[{id:'w1'}],people:[],cards:[],walletTx:[],daily:[],expenses:[],monthly:[],peopleTx:[],cardTx:[],activeWallet:'w1',activePerson:null,activeCard:null},
   main:{querySelectorAll:()=>[]},document:{getElementById:()=>null},alert:m=>log.alerts.push(m),
   requireLoaded:()=>true,setSaveStatus(){},
   gsRun:async(fn,...args)=>{log.calls.push(fn);if(server.mode==='net')throw new Error('Network error');if(server.mode==='reject')throw new Error('Validation failed');return server.reply},
   loadAll:async()=>{log.resyncs++},
   render(){log.renders++;log.pendingAtRender.push([...c.pending])}};
  vm.createContext(c);
  vm.runInContext(honest+'\nthis.pending=pending;this.unsaved=unsaved;this.retryQueue=retryQueue;this.remoteCall=remoteCall;this.saveNew=saveNew;this.saveNewMany=saveNewMany;this.saveEdit=saveEdit;this.saveDelete=saveDelete;this.flushQueue=flushQueue;this.isTransient=isTransient;',c);
  return {c,log,server};
}
(async()=>{
await t('add OK: row stays, shown as pending during the save, pending cleared after',async()=>{
 const {c,log}=env();c.state.daily.push({id:'d1'});eq(await c.saveNew('daily','mf_daily',c.state.daily[0]),true);
 eq(c.state.daily.length,1);eq(log.pendingAtRender[0],['d1']);eq([...c.pending],[]);eq(c.retryQueue.length,0)});
await t('add REJECTED by server: row rolled back, error shown, nothing queued',async()=>{
 const {c,log,server}=env();server.mode='reject';c.state.daily.push({id:'d1'});eq(await c.saveNew('daily','mf_daily',c.state.daily[0]),false);
 eq(c.state.daily.length,0);eq(c.retryQueue.length,0);if(!/Validation failed/.test(log.alerts[0]))throw new Error('no alert')});
await t('add + server says {ok:false,not_found}: rolled back with a clear message',async()=>{
 const {c,log,server}=env();server.reply={ok:false,reason:'not_found'};c.state.daily.push({id:'d1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);
 eq(c.state.daily.length,0);if(!/Refresh karo/.test(log.alerts[0]))throw new Error(log.alerts[0])});
await t('rejected new wallet: active selection falls back; transfer rejected: BOTH rows removed',async()=>{
 const {c,server}=env();server.mode='reject';c.state.wallets.push({id:'w2'});c.state.activeWallet='w2';await c.saveNew('wallets','mf_wallets',c.state.wallets[1]);eq(c.state.activeWallet,'w1');
 const a={id:'t1'},b={id:'t2'};c.state.walletTx.push(a,b);await c.saveNewMany('walletTx','mf_wallet_tx',[a,b]);eq(c.state.walletTx.length,0)});
await t('INTERNET DOWN: add stays on screen as unsaved, queued, no alert',async()=>{
 const {c,log,server}=env();server.mode='net';c.state.daily.push({id:'d1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);
 eq(c.state.daily.length,1);eq(c.retryQueue.length,1);eq([...c.unsaved],['d1']);eq(log.alerts.length,0)});
await t('retry: when the internet is back the queued add is sent and cleared',async()=>{
 const {c,server,log}=env();server.mode='net';c.state.daily.push({id:'d1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);
 await c.flushQueue();eq(c.retryQueue.length,1,'still offline: stays queued');server.mode='ok';log.calls.length=0;await c.flushQueue();eq(c.retryQueue.length,0);eq([...c.unsaved],[]);eq(log.calls,['appendItem'])});
await t('queue keeps ORDER and stops at the first failure',async()=>{
 const {c,server,log}=env();server.mode='net';for(const id of ['a','b','c']){c.state.daily.push({id});await c.saveNew('daily','mf_daily',c.state.daily[c.state.daily.length-1])}
 log.calls.length=0;await c.flushQueue();eq(log.calls.length,1,'only the first attempted');server.mode='ok';log.calls.length=0;await c.flushQueue();eq(log.calls.length,3);eq(c.retryQueue.length,0)});
await t('edit offline keeps the NEW values and queues one edit; a 2nd edit does not queue twice',async()=>{
 const {c,server,log}=env();server.mode='net';const o={id:'e1',amount:10};c.state.daily.push(o);const snap={...o};o.amount=99;await c.saveEdit('mf_daily',o,snap);
 eq(o.amount,99);eq(c.retryQueue.length,1);o.amount=120;await c.saveEdit('mf_daily',o,{...o});eq(c.retryQueue.length,1);server.mode='ok';log.calls.length=0;await c.flushQueue();eq(log.calls,['updateItem'])});
await t('edit of a never-saved row is folded into its queued ADD (one request, latest values)',async()=>{
 const {c,server,log}=env();server.mode='net';const o={id:'n1',amount:1};c.state.daily.push(o);await c.saveNew('daily','mf_daily',o);o.amount=5;await c.saveEdit('mf_daily',o,{amount:1});
 eq(c.retryQueue.map(e=>e.op),['add']);server.mode='ok';log.calls.length=0;await c.flushQueue();eq(log.calls,['appendItem'])});
await t('delete of a never-saved row cancels the queued add (nothing reaches the server)',async()=>{
 const {c,server,log}=env();server.mode='net';c.state.daily.push({id:'g1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);await c.saveDelete('daily','mf_daily','g1');
 eq(c.retryQueue.length,0);eq(c.state.daily.length,0);server.mode='ok';log.calls.length=0;await c.flushQueue();eq(log.calls.length,0)});
await t('delete offline of a saved row: stays deleted locally and is queued',async()=>{
 const {c,server}=env();server.mode='net';c.state.daily.push({id:'a'},{id:'b'});await c.saveDelete('daily','mf_daily','a');eq(c.state.daily.map(x=>x.id),['b']);eq(c.retryQueue.map(e=>e.op),['del'])});
await t('delete REJECTED: row comes back in the SAME position',async()=>{
 const {c,server}=env();server.mode='reject';c.state.daily.push({id:'a'},{id:'b'},{id:'c'});await c.saveDelete('daily','mf_daily','b');eq(c.state.daily.map(x=>x.id),['a','b','c'])});
await t('edit REJECTED: old values restored',async()=>{
 const {c,server}=env();server.mode='reject';const o={id:'e1',amount:10,note:'old'};const snap={...o};o.amount=99;o.note='new';await c.saveEdit('mf_x',o,snap);eq([o.amount,o.note],[10,'old'])});
await t('queued item later REJECTED for real: dropped, user told, screen resynced from the Sheet',async()=>{
 const {c,server,log}=env();server.mode='net';c.state.daily.push({id:'d1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);server.mode='reject';await c.flushQueue();
 eq(c.retryQueue.length,0);eq([...c.unsaved],[]);eq(log.resyncs,1);if(!log.alerts.some(a=>/accept nahi/.test(a)))throw new Error('no alert')});
await t('queued delete that finds the row already gone is treated as success (no scary alert)',async()=>{
 const {c,server,log}=env();server.mode='net';c.state.daily.push({id:'a'});await c.saveDelete('daily','mf_daily','a');server.mode='ok';server.reply={ok:false,reason:'not_found'};log.alerts.length=0;
 await c.flushQueue();eq(c.retryQueue.length,0);eq(log.alerts.length,0)});
await t('gives up after 5 failed attempts (treated as a real failure, not an endless loop)',async()=>{
 const {c,server,log}=env();server.mode='net';c.state.daily.push({id:'d1'});await c.saveNew('daily','mf_daily',c.state.daily[0]);
 for(let i=0;i<6;i++)await c.flushQueue();eq(c.retryQueue.length,0);eq(log.resyncs,1)});
await t('own writes keep the data version in step (no self-refresh); others\' writes do not',async()=>{
 const {c,server}=env();server.reply={ok:true,v:6};await c.remoteCall('appendItem');eq(c.state.dataVersion,6);
 server.reply={ok:true,v:9};await c.remoteCall('appendItem');eq(c.state.dataVersion,6,'gap => someone else wrote => poll must reload')});
await t('error classification',async()=>{const {c}=env();
 [ 'Network error','Server busy hai, thodi der baad dobara try karo','timed out',''].forEach(m=>eq(c.isTransient(new Error(m)),true,m));
 ['Validation failed','Access denied','Date galat hai: x','Invalid id'].forEach(m=>eq(c.isTransient(new Error(m)),false,m))});
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);})();

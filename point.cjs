// Phase one: private credentials, read-only discovery, and two fixed test tickets.
// Mode changes require a separate, explicit administrator confirmation.
// Never changes accounts or payment data.
const crypto = require('node:crypto');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(x);
const states = new Set(['created','on_terminal','canceled','cancelled','finished','completed','failed','error','processed']);
const state = x => states.has(x) ? x : 'unknown';
const config = () => ({configured: !!process.env.MP_ACCESS_TOKEN?.trim(), environment: process.env.MP_ENVIRONMENT === 'production' ? 'production' : 'test'});
const safeBatches = d => (d.pointBatches || []).slice(-20).map(b => ({id:b.id,at:b.at,terminalId:b.terminalId,environment:b.environment,jobs:b.jobs.map(j=>({kind:j.kind,status:j.status,checkedAt:j.checkedAt}))}));
function createPoint(store, authorize, fetcher = fetch) {
 const token = () => process.env.MP_ACCESS_TOKEN?.trim();
 const fingerprint = () => hash(token() || '');
 async function api(path, body, key, method) {
   const secret = token(); if (!secret) fail('Falta MP_ACCESS_TOKEN en la configuración del servidor.');
   let r;
   try { r = await fetcher('https://api.mercadopago.com' + path, {
     method:method||(body?'POST':'GET'),redirect:'error',signal:AbortSignal.timeout(8000),
     headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{}),...(key?{'X-Idempotency-Key':key}:{})},
     body:body?JSON.stringify(body):undefined
   }); } catch { fail('No se pudo confirmar con Mercado Pago. Revisa el estado antes de repetir.', 502); }
   if (!r.ok) {
     // Never forward provider error bodies: they can contain secrets or account data.
     const messages={401:'Mercado Pago rechazó la credencial. Revisa el Access Token en Render.',403:'La credencial no tiene permiso para esta operación.',400:'Mercado Pago rechazó la solicitud. Revisa la asociación y modo de la terminal.',404:'No se encontró la terminal o acción en esta cuenta.',429:'Mercado Pago solicita esperar antes de continuar.'};
     fail(messages[r.status] || 'Mercado Pago no pudo confirmar la operación.',502);
   }
   try { return await r.json(); } catch { fail('Respuesta de Mercado Pago no reconocida.',502); }
 }
 async function terminals() {
   const r=await api('/terminals/v1/list?limit=50&offset=0');
   if (!Array.isArray(r.data?.terminals)) fail('No se reconoció el listado de terminales de Mercado Pago.',502);
   return {configured:true,environment:config().environment,terminals:r.data.terminals.filter(t=>validId(t.id)).map(t=>({id:t.id,mode:['PDV','STANDALONE','UNDEFINED'].includes(t.operating_mode)?t.operating_mode:'UNDEFINED'})),hasMore:Number(r.paging?.total)>50};
 }
 async function transaction(fn) { return store.transaction(d=>{const user=authorize(d);return fn(d,user);}); }
 async function setMode(body) {
   if(!validId(body.terminalId)||!['PDV','STANDALONE'].includes(body.mode)||!['PDV','STANDALONE'].includes(body.expectedMode)||body.confirm!==true||!/^[0-9a-f-]{36}$/i.test(body.requestId||''))fail('Confirma la terminal y el cambio de modo.');
   const fp=fingerprint();
   await transaction((d,user)=>{
     const prior=d.pointModeChange;
     if(prior?.status==='pending'&&Date.now()-Date.parse(prior.at)<60000)fail('Ya hay un cambio en curso. Consulta terminales y espera un minuto antes de repetir.',409);
     if(prior?.id===body.requestId)fail('Este cambio ya fue solicitado. Consulta terminales para comprobar el resultado.',409);
     d.pointModeChange={id:body.requestId,terminalId:body.terminalId,mode:body.mode,status:'pending',at:new Date().toISOString(),fingerprint:fp,userId:user?.id};
   });
   try {
     const list=await terminals(),t=list.terminals.find(t=>t.id===body.terminalId);
     if(!t)fail('Esa terminal no pertenece a la cuenta configurada.');
     if(t.mode!==body.mode){
       if(t.mode!==body.expectedMode)fail('El modo cambió desde la última consulta. Actualiza antes de continuar.',409);
       await transaction(()=>{if(fingerprint()!==fp)fail('La credencial cambió. Actualiza la consulta.',409);});
       const result=await api('/terminals/v1/setup',{terminals:[{id:body.terminalId,operating_mode:body.mode}]},undefined,'PATCH');
       if(!Array.isArray(result.terminals)||!result.terminals.some(t=>t.id===body.terminalId&&t.operating_mode===body.mode))fail('No se confirmó el cambio. Consulta terminales antes de repetir.',502);
     }
     await store.transaction(d=>{if(d.pointModeChange?.id===body.requestId)d.pointModeChange.status='confirmed';d.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),userId:d.pointModeChange?.userId,user:'Administrador',message:'Point: solicitó modo '+body.mode+'; requiere reiniciar terminal'});});
     return {mode:body.mode,restartRequired:true};
   }catch(e){
     await store.transaction(d=>{if(d.pointModeChange?.id===body.requestId)d.pointModeChange.status='uncertain';});
     throw e;
   }
 }
 async function printTest(body) {
   if (!validId(body.terminalId) || !/^[0-9a-f-]{36}$/i.test(body.requestId||'') || body.confirm !== true) fail('Selecciona una terminal y confirma los dos tickets de prueba.');
   const before=await transaction(d=>(d.pointBatches||[]).find(b=>b.id===body.requestId));
   if (before && (before.terminalId!==body.terminalId || before.fingerprint!==fingerprint())) fail('La solicitud pertenece a otra terminal o credencial.',409);
   if (!before) {
     const list=await terminals();const t=list.terminals.find(t=>t.id===body.terminalId);
     if(!t) fail('Esa terminal no aparece con esta credencial. La cuenta de prueba puede ser distinta de tu cuenta habitual.');
     if(t.mode!=='PDV') fail('La terminal está en modo '+t.mode+'. No se cambió su configuración. Revisa primero cómo afectaría el modo PDV a tus cobros.');
   }
   await transaction(d=>{
     d.pointBatches ||= [];
     const existing=d.pointBatches.find(b=>b.id===body.requestId);if(existing){if(existing.terminalId!==body.terminalId||existing.fingerprint!==fingerprint())fail('Solicitud reutilizada para otra terminal o credencial.',409);return;}
     const prior=d.pointBatches.at(-1);
     if(prior && Date.now()-Date.parse(prior.at)<60000) fail('Espera un minuto y revisa los tickets antes de enviar otra prueba.',429);
     d.pointBatches.push({id:body.requestId,terminalId:body.terminalId,fingerprint:fingerprint(),environment:config().environment,at:new Date().toISOString(),jobs:['kitchen','customer'].map(kind=>({kind,key:crypto.randomUUID(),status:'ready'}))});
   });
   for(const kind of ['kitchen','customer']) {
     const job=await transaction(d=>{const b=d.pointBatches.find(b=>b.id===body.requestId);if(b.fingerprint!==fingerprint()||b.terminalId!==body.terminalId) fail('La credencial o terminal cambió. Revisa la configuración.',409);const j=b.jobs.find(j=>j.kind===kind);if(j.status!=='ready')return null;j.status='sending';return structuredClone(j);});
     if(!job) continue; // A concurrent request or a previous attempt already took it.
     let result,status;
     try {
       result=await api('/terminals/v1/actions', {type:'print',external_reference:'2d-test-'+job.key,
         config:{point:{terminal_id:body.terminalId,subtype:'custom'}},content:testContent(kind)},job.key);
       if(!validId(result.id)) fail('No se recibió identificador de impresión.',502);
       status=state(result.status);
     } catch { status='uncertain'; }
     await store.transaction(d=>{const j=d.pointBatches.find(b=>b.id===body.requestId).jobs.find(j=>j.kind===kind);j.status=status;j.checkedAt=new Date().toISOString();if(result&&validId(result.id))j.actionId=result.id;});
   }
   return transaction(d=>({batches:safeBatches(d)}));
 }
 async function check(body) {
   const b=await transaction(d=>(d.pointBatches||[]).find(b=>b.id===body.requestId));
   if(!b) fail('Prueba no encontrada.',404);
   if(b.fingerprint!==fingerprint()) fail('La prueba pertenece a otra credencial. No se consultó con la nueva clave.',409);
   for(const j of b.jobs) if(j.actionId) {
     const result=await api('/terminals/v1/actions/'+encodeURIComponent(j.actionId));
     await transaction(d=>{const x=d.pointBatches.find(x=>x.id===b.id).jobs.find(x=>x.key===j.key);x.status=state(result.status);x.checkedAt=new Date().toISOString();});
   }
   return transaction(d=>({batches:safeBatches(d)}));
 }
 return {terminals,printTest,check,setMode};
}
function testContent(kind) {
 const lines=kind==='kitchen'?['COCINA - PRUEBA','NO PREPARAR / SIN VALOR','Pedido de ejemplo','2 x Hamburguesa de prueba','Extra: queso por pieza','INDICACIONES: sin cebolla']:['CLIENTE - PRUEBA','NO COBRAR / SIN VALOR','Pedido de ejemplo','Total de ejemplo: $100.00','PENDIENTE DE PAGO','SERVICIO A DOMICILIO','9321693968','Gracias por tu compra'];
 return '{center}{w}2D{/w}{br}{b}'+lines[0]+'{/b}{/center}{br}'+lines.slice(1).join('{br}')+'{br}--------------------------------{br}';
}
module.exports={createPoint,config,safeBatches,testContent};

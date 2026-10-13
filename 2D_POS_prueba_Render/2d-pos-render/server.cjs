const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore}=require('./store.cjs');const D=require('./domain.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const constant=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
async function createApp(){
 const store=await openStore();const production=process.env.NODE_ENV==='production';
 const configuredOrigin=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL;
 if(production&&!configuredOrigin)throw new Error('Falta RENDER_EXTERNAL_URL o PUBLIC_URL para validar el origen.');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  function json(data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  function cookie(value,age=43200){res.setHeader('Set-Cookie',`pos_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`);}
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/health'){await store.transaction(()=>null);return json({ok:true});}
   if(!url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))D.fail('Método no permitido.',405);
    const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest','/assets/logo-2d.jpeg':'assets/logo-2d.jpeg'};const f=files[url.pathname];if(!f)D.fail('No encontrado.',404);
    const type=f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.webmanifest')?'application/manifest+json':'image/jpeg';res.setHeader('Content-Type',type+'; charset=utf-8');return res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.join(__dirname,'public',f)));
   }
   if(!['GET','POST'].includes(req.method))D.fail('Método no permitido.',405);
   let body={};if(req.method==='POST'){
    const origin=configuredOrigin||`http://${req.headers.host}`;
    if(req.headers.origin!==new URL(origin).origin||req.headers['x-2d-request']!=='1')D.fail('Origen no permitido.',403);
    if(!req.headers['content-type']?.startsWith('application/json'))D.fail('Se requiere JSON.',415);
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256000)D.fail('Solicitud demasiado grande.',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{D.fail('JSON inválido.');}if(!body||typeof body!=='object'||Array.isArray(body))D.fail('Solicitud inválida.');
   }
   const rawCookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pos_session='))?.slice(12)||'';
   const outcome=await store.transaction(async(original)=>{
    const d=structuredClone(original);d.sessions=d.sessions.filter(s=>s.expires>Date.now());for(const [k,v]of Object.entries(d.limits))if(v.until<Date.now())delete d.limits[k];
    let session=d.sessions.find(s=>s.tokenHash===sha(rawCookie)),user=session&&d.users.find(u=>u.id===session.userId&&u.active);
    function signIn(u){const token=crypto.randomBytes(32).toString('hex');d.sessions.push({tokenHash:sha(token),userId:u.id,expires:Date.now()+43200000});return token;}
    try{
     let value,token,clear=false;
     if(req.method==='GET'&&url.pathname==='/api/bootstrap')value={initialized:d.users.length>0,...(user?D.view(d,user):{me:null})};
     else if(req.method==='POST'&&url.pathname==='/api/setup'){
      if(d.users.length)D.fail('El administrador ya fue creado.',409);
      D.limit(d,'setup',10);const setup=process.env.SETUP_TOKEN;if(!setup||setup.length<24||!constant(body.token,setup))D.fail('Clave de instalación incorrecta.',403);
      const fields=D.accountFields({...body,role:'admin'});user={id:D.uid(),...fields,active:true,passwordHash:await D.hashPassword(body.password)};d.users.push(user);token=signIn(user);D.audit(d,user,'Creó el administrador inicial');value={ok:true};
     }else if(req.method==='POST'&&url.pathname==='/api/login'){
      const username=D.text(body.username,30).toLowerCase();D.limit(d,'login:'+username);const ip=req.headers['x-forwarded-for']?.split(',').pop().trim()||req.socket.remoteAddress;D.limit(d,'ip:'+ip,60);
      user=d.users.find(u=>u.username===username&&u.active);const valid=await D.checkPassword(body.password,user?.passwordHash||'00'.repeat(16)+':'+'00'.repeat(64));if(!user||!valid)D.fail('Usuario o contraseña incorrectos, o cuenta deshabilitada.',401);delete d.limits['login:'+username];token=signIn(user);value={ok:true};
     }else{
      if(!user)D.fail('Inicia sesión. Tu cuenta puede haber sido deshabilitada.',401);
      if(req.method==='POST'&&url.pathname==='/api/logout'){d.sessions=d.sessions.filter(s=>s!==session);clear=true;value={ok:true};}
      else if(req.method==='GET'&&url.pathname==='/api/export'){if(user.role!=='admin')D.fail('Solo el administrador puede exportar.',403);value={exportedAt:D.now(),schema:d.schema,products:d.products,promos:d.promos,tables:d.tables,orders:d.orders,cash:d.cash,movements:d.movements,audit:d.audit,users:d.users.map(D.safeUser)};}
      else if(req.method==='POST'&&url.pathname==='/api/action'){
       if(!/^[0-9a-f-]{36}$/i.test(body.requestId||''))D.fail('Falta identificador de operación.');const hash=sha(JSON.stringify(body));const prior=d.receipts.find(r=>r.userId===user.id&&r.id===body.requestId);if(prior){if(prior.hash!==hash)D.fail('Identificador de operación reutilizado.',409);value=prior.result;}else{value=await D.act(d,user,body);d.receipts.push({id:body.requestId,userId:user.id,hash,result:value,at:Date.now()});d.receipts=d.receipts.filter(r=>r.at>Date.now()-86400000);}
       if(value.loggedOut)clear=true;
      }else D.fail('Ruta no encontrada.',404);
     }
     Object.assign(original,d);return {value,token,clear};
    }catch(e){original.limits=d.limits;return {error:e.message,status:e.status||500};}
   });
   if(outcome.error)return json({error:outcome.status===500?'Error del servidor. Reintenta.':outcome.error},outcome.status);
   if(outcome.token)cookie(outcome.token);if(outcome.clear)cookie('',0);return json(outcome.value);
  }catch(e){json({error:e.status?e.message:'No fue posible completar la solicitud.'},e.status||500);}
 });server.requestTimeout=30000;server.headersTimeout=10000;
 return {server,store};
}
if(require.main===module)createApp().then(({server})=>server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('2D POS iniciado.'))).catch(()=>{console.error('No fue posible iniciar. Comprueba la conexión de base de datos y las variables requeridas.');process.exit(1);});
module.exports={createApp};

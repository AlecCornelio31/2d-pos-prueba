const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function initial(){const products=JSON.parse(fs.readFileSync(path.join(__dirname,'catalog.json')));const p=products.find(x=>x.name==='Jochote clásico');return {schema:1,users:[],sessions:[],limits:{},receipts:[],products,promos:[{id:crypto.randomUUID(),name:'Dúo de jochotes',productId:p.id,qty:2,price:10000,active:true}],tables:Array.from({length:8},(_,i)=>String(i+1)),orders:[],cash:[],movements:[],audit:[],nextFolio:1};}
async function openStore(){
 if(process.env.DATABASE_URL){
  const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:15000});
  // Single document for this small trial; row locking serializes all mutations.
  // Migration runs at startup, never in a request handler.
  await pool.query('CREATE TABLE IF NOT EXISTS pos_trial (id INTEGER PRIMARY KEY, data JSONB NOT NULL)');
  await pool.query('INSERT INTO pos_trial(id,data) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[JSON.stringify(initial())]);
  return {async transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const {rows}=await c.query('SELECT data FROM pos_trial WHERE id=1 FOR UPDATE');const d=rows[0].data;const result=await fn(d);await c.query('UPDATE pos_trial SET data=$1 WHERE id=1',[JSON.stringify(d)]);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},close:()=>pool.end()};
 }
 if(process.env.NODE_ENV==='production')throw new Error('DATABASE_URL es obligatoria en producción. No se usará almacenamiento efímero.');
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.SQLITE_PATH||'trial.sqlite');db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS pos_trial(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT OR IGNORE INTO pos_trial(id,data) VALUES(1,?)').run(JSON.stringify(initial()));
 let queue=Promise.resolve();
 return {transaction(fn){const task=queue.then(async()=>{db.exec('BEGIN IMMEDIATE');try{const d=JSON.parse(db.prepare('SELECT data FROM pos_trial WHERE id=1').get().data);const r=await fn(d);db.prepare('UPDATE pos_trial SET data=? WHERE id=1').run(JSON.stringify(d));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}});queue=task.catch(()=>{});return task;},close:async()=>{await queue;db.close();}};
}
module.exports={openStore};

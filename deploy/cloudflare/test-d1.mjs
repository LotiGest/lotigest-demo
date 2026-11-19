import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as session} from '../../functions/api/app/session.js';
import {hash} from '../../functions/api/app/shared.js';
export class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE users(name TEXT PRIMARY KEY,role TEXT,token_hash TEXT UNIQUE); CREATE TABLE d1_user_passwords(name TEXT PRIMARY KEY,salt TEXT);');this.db.exec(readFileSync(new URL('./migrations/0003_app_persistence.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('./migrations/0004_login_limits.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('./migrations/0005_map_asset_mime.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('./migrations/0006_public_lot_maps.sql',import.meta.url),'utf8'));  }
 prepare(sql){const self=this;return {sql,args:[],bind(...args){this.args=args;return this;},async first(){return self.db.prepare(sql).get(...this.args)||null;},async all(){return {results:self.db.prepare(sql).all(...this.args)};},async run(){if(self.fail&&sql.startsWith('INSERT INTO app_records'))throw Error('simulated SQL failure');const stmt=self.db.prepare(sql);if(stmt.columns().length)return {results:stmt.all(...this.args),meta:{changes:0}};const result=stmt.run(...this.args);return {results:[],meta:{changes:Number(result.changes)}};}};}
 async batch(queries){this.db.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export async function fixture(){const db=new D1(),credential='a'.repeat(64);db.db.prepare('INSERT INTO users VALUES(?,?,?)').run('admin','admin',await hash(credential));db.db.prepare('INSERT INTO d1_user_passwords VALUES(?,?)').run('admin','b'.repeat(64));const env={LOTIGEST_DB:db};const r=await session({env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({credential})})});assert.equal(r.status,200);const cookie=r.headers.get('Set-Cookie').split(';')[0];return {db,env,cookie,credential};}
export function empty(){return {version:3,company:{name:'GRUPO H'},lots:[],clients:[],sales:[],payments:[]};}

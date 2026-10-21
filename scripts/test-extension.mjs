import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = await mkdtemp(join(tmpdir(),'avatar-managed-'));
const upstream = createServer((req,res)=>res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({agents:[{id:'fixture',name:'Fixture Agent'}]})));
upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(done=>reserve.close(done));
let child;
async function start(extra={}) {
  child=spawn('./scripts/xangi-extension',['serve','--workspace',dir],{env:{PATH:process.env.PATH,AVATAR_DATA_DIR:dir,AVATAR_PORT:String(port),XANGI_EXTENSION_AUTH_TOKEN:'fixture-token',XANGI_EXTENSION_HOST_URL:`http://127.0.0.1:${upstream.address().port}`,...extra},stdio:['pipe','pipe','pipe']});
  child.stderr.resume();
  const ready = await new Promise((done,fail)=>{
    let buffer='';const timer=setTimeout(()=>fail(Error('ready timeout')),10000);
    child.once('exit',code=>{clearTimeout(timer);fail(Error(`early exit ${code}`));});
    child.stdout.on('data',chunk=>{buffer+=chunk;for(const line of buffer.split('\n')){if(line.startsWith('{')){const data=JSON.parse(line);if(data.event==='ready'){clearTimeout(timer);done(data);}}}});
  });
  assert.equal(ready.workspace,dir);return ready;
}
async function stop(){const ended=once(child,'exit');child.stdin.end();const [code]=await ended;assert.equal(code,0);child=undefined;}
try {
  const manifest=JSON.parse(await readFile('xangi-extension.json','utf8'));
  assert.equal(manifest.ui.capability,'avatar.ui');
  const saved={customCharacters:[],selectedCharacter:'assistant'};
  let ready=await start();
  assert.equal((await fetch(ready.baseUrl+'/health')).status,401);
  const auth={authorization:'Bearer fixture-token'};
  assert.equal((await fetch(ready.baseUrl+'/health',{headers:auth})).status,200);
  const html=await (await fetch(ready.baseUrl+'/ui',{headers:auth})).text();assert.match(html,/location.replace/);assert.match(html,/service/);assert.ok(!html.includes('fixture-token'));
  assert.notEqual(new URL(ready.baseUrl).port, String(port));
  assert.equal((await fetch(ready.baseUrl+'/api/avatar/config')).status,401);
  const config=await (await fetch(ready.baseUrl+'/api/avatar/config',{headers:auth})).json();assert.equal(config.agents[0].id,'fixture');
  const page=await (await fetch(ready.baseUrl+'/',{headers:auth})).text();assert.match(page,/<title>/);
  const response=await fetch(ready.baseUrl+'/api/avatar/settings/characters',{method:'PUT',headers:{...auth,'content-type':'application/json',origin:ready.baseUrl},body:JSON.stringify(saved)});assert.equal(response.status,200);
  const bytes=await readFile(join(dir,'character-settings.json'));
  await stop();await assert.rejects(fetch(ready.baseUrl+'/',{headers:auth}));
  await writeFile(join(dir,'config.env'),'AVATAR_PUBLIC_URL=https://avatar.example/\n');
  ready=await start();assert.match(await (await fetch(ready.baseUrl+'/ui',{headers:auth})).text(), /service/);
  assert.deepEqual(await readFile(join(dir,'character-settings.json')),bytes);await stop();
  reserve.listen(port,'127.0.0.1');await once(reserve,'listening');
  ready=await start(); assert.notEqual(new URL(ready.baseUrl).port, String(port)); await stop();
  await new Promise(done=>reserve.close(done));
  console.log('managed extension: manifest, authenticated gateway, host Agent API, UI, persistent settings, config reload, shutdown and automatic port allocation passed');
} finally {if(child)child.kill('SIGKILL');upstream.closeAllConnections();await new Promise(done=>upstream.close(done));await rm(dir,{recursive:true,force:true});}

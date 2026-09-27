import json,threading,functools,sys
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=sys.argv[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=root+'/dist'));threading.Thread(target=srv.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{srv.server_port}'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox']);page=b.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("window.streams=[];window.EventSource=class {constructor(){streams.push(this)} addEventListener(){} close(){}}; localStorage.setItem('xangi-avatar:host-agent-session:custom-test:a1','s1');")
 model={'backend':'local-llm','source':'provider','observedModels':['qwen3.8-27b'],'effectiveModel':'qwen3.8-27b','status':'completed'}
 def api(r):
  u=r.request.url
  if '/config' in u:r.fulfill(json={'agents':[{'id':'a1','name':'Test'}],'characterSettings':{'selectedCharacter':'custom-test','customCharacters':[{'id':'custom-test','agentId':'a1','name':'Test','tts':'browser','stt':'browser'}]}})
  elif '/session/status' in u:r.fulfill(json={'exists':True,'lifecycle':'open','modelExecution':model if 's1' in u else None})
  elif u.endswith('/session'):r.fulfill(json={'sessionId':'s2','agentId':'a1'})
  else:r.fulfill(json={})
 page.route('**/api/avatar/**',api)
 page.goto(base);page.wait_for_function("document.querySelector('#modelExecutionLabel').textContent.includes('qwen3.8-27b')")
 for width in [1280,390,320]:
  page.set_viewport_size({'width':width,'height':900});assert page.locator('#modelExecutionLabel').is_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(animations='disabled',path=f'/tmp/avatar-model-{width}.png')
 model['effectiveModel']='actual-next';model['observedModels']=['actual-next']
 page.evaluate("streams.forEach(s=>s.onmessage?.({data:JSON.stringify({type:'turn.complete',thread_id:'web:s1',text:''})}))")
 page.wait_for_function("document.querySelector('#modelExecutionLabel').textContent.includes('actual-next')")
 page.locator('#newConversationButton').click()
 page.wait_for_function("document.querySelector('#modelExecutionLabel').textContent.includes('まだ記録がありません')")
 assert not errors,errors
 print(json.dumps({'widths':[1280,390,320],'resume':True,'turnCompleteRefresh':True,'newConversationReset':True,'errors':errors}))
 b.close()
srv.shutdown()

import concurrent.futures
import http.client
import json
import threading
import time
import unittest
from unittest.mock import patch, Mock
import agent
import control

READ='r'*43
TOKEN='c'*43
ORIGIN='https://example.github.io'
APPS=[{'id':'notepad','label':'Notepad','path':r'C:\Windows\System32\notepad.exe'}]

class FakeWindows:
    def __init__(self): self.calls=[]; self.failed=False
    def execute(self,action,app):
        self.calls.append((action,app))
        if self.failed: raise OSError('private diagnostic never returned')

class ControlTest(unittest.TestCase):
    def setUp(self):
        self.now=1000.0; self.os=FakeWindows()
        self.c=control.Controller(TOKEN,READ,APPS,self.os,lambda:self.now)
    def intent(self,action='lock',rid='test_request_0001',app_id=''):
        return self.c.challenge(dict(action=action,app_id=app_id,request_id=rid))
    def wait(self,rid='test_request_0001'):
        for _ in range(100):
            r=self.c.result(rid)
            if r['state'] not in ('queued','executing'):return r
            time.sleep(.005)
        self.fail('Executor did not finish')
    def execute(self,intent):
        return self.c.execute({k:intent[k] for k in ('challenge','request_id')})
    def test_separate_credential(self):
        for token in ('short',READ):
            with self.assertRaises(ValueError):control.Controller(token,READ,[])
        with self.assertRaises(control.ControlError):self.c.authorize('Bearer '+READ)
        self.c.authorize('Bearer '+TOKEN)
    def test_all_actions_use_fixed_adapter(self):
        for i,action in enumerate(control.ACTIONS):
            self.now+=61
            rid='test_request_%04d'%i
            self.execute(self.intent(action,rid,'notepad' if action=='launch' else ''))
            self.assertEqual(self.wait(rid)['state'],'accepted_by_windows')
        self.assertEqual([x[0] for x in self.os.calls],list(control.ACTIONS))
    def test_expired_intent(self):
        i=self.intent();self.now+=15
        with self.assertRaises(control.ControlError):self.execute(i)
        self.assertEqual(self.os.calls,[])
    def test_atomic_replay(self):
        i=self.intent()
        def attempt(_):
            try:self.execute(i);return True
            except control.ControlError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            self.assertEqual(sum(pool.map(attempt,range(24))),1)
        self.wait();self.assertEqual(self.os.calls,[('lock','')])
    def test_failure_consumes_intent(self):
        self.os.failed=True;i=self.intent();self.execute(i)
        self.assertEqual(self.wait()['state'],'failed')
        with self.assertRaises(control.ControlError):self.execute(i)
        self.assertNotIn('private',json.dumps(self.c.result(i['request_id'])))
    def test_binding_and_duplicate_id(self):
        i=self.intent()
        with self.assertRaises(control.ControlError):self.intent()
        bad=dict(i,request_id='another_request_id')
        with self.assertRaises(control.ControlError):self.execute(bad)
        with self.assertRaises(control.ControlError):self.c.execute(dict(i,action='shutdown'))
        self.execute(i);self.wait();self.assertEqual(self.os.calls,[('lock','')])
    def test_unknown_inputs(self):
        for body in (None,[],{},dict(action='shell',app_id='',request_id='test_request_0001'),dict(action='launch',app_id='cmd',request_id='test_request_0001'),dict(action='lock',app_id='notepad',request_id='test_request_0001')):
            with self.assertRaises(control.ControlError):self.c.challenge(body)
    def test_rate_limits(self):
        for i in range(5):self.intent(rid='test_request_%04d'%i)
        with self.assertRaises(control.ControlError) as e:self.intent(rid='test_request_9999')
        self.assertEqual(e.exception.status,429)
    def test_execution_limits(self):
        for i in range(3):
            self.now+=3;rid='test_request_%04d'%i;self.execute(self.intent(rid=rid));self.wait(rid)
        self.now+=3;i=self.intent(rid='test_request_9999')
        with self.assertRaises(control.ControlError) as e:self.execute(i)
        self.assertEqual(e.exception.status,429)
    def test_restart_invalidates_challenge(self):
        i=self.intent();other=control.Controller(TOKEN,READ,APPS,self.os)
        with self.assertRaises(control.ControlError):other.execute(i)
    def test_path_policy(self):
        for path in ('notepad.exe',r'\\server\share\a.exe',r'C:\x.cmd',r'C:\x.exe:ads',r'C:\..\a.exe',r'C:\Windows\System32\cmd.exe',r'C:\x.exe" & shutdown'):
            with self.assertRaises(ValueError):control.validate_apps([dict(APPS[0],path=path)])
        with self.assertRaises(ValueError):control.validate_apps([dict(APPS[0],args=['/c'])])
        self.assertNotIn('path',self.c.capabilities()['apps'][0])
    def test_native_shutdown_arguments_are_not_forced(self):
        with patch.object(control.subprocess,'run') as run,patch.object(control.os,'name','nt'),patch.object(control.subprocess,'CREATE_NO_WINDOW',0,create=True):
            native=control.WindowsActions({})
            native.execute('restart','');native.execute('shutdown','')
            for call in run.call_args_list:
                self.assertEqual(call.args[0][-2:],['/t','0'])
                self.assertNotIn('/f',call.args[0]);self.assertFalse(call.kwargs['shell'])
    def test_native_launch_no_args_and_revalidates(self):
        native=control.WindowsActions(control.validate_apps(APPS));path=APPS[0]['path']
        with patch.object(control.os,'name','nt'),patch.object(control.os.path,'isfile',return_value=True),patch.object(control.os.path,'realpath',return_value=path),patch.object(control.subprocess,'Popen') as launch:
            native.execute('launch','notepad');self.assertEqual(launch.call_args.args[0],[path]);self.assertFalse(launch.call_args.kwargs['shell'])
        with patch.object(control.os,'name','nt'),patch.object(control.os.path,'isfile',return_value=False),patch.object(control.subprocess,'Popen') as launch:
            with self.assertRaises(OSError):native.execute('launch','notepad')
            launch.assert_not_called()

class ControlHTTPTest(unittest.TestCase):
    def setUp(self):
        self.os=FakeWindows();self.server=agent.make_server(0,READ,ORIGIN,'pc.tail123.ts.net')
        self.server.control=control.Controller(TOKEN,READ,APPS,self.os)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):self.server.shutdown();self.server.server_close()
    def req(self,path='/v1/control',method='GET',body=None,token=TOKEN,origin=ORIGIN,extra=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
        headers={'Origin':origin,'Authorization':'Bearer '+token}
        if body is not None:headers['Content-Type']='application/json'
        if extra:headers.update(extra)
        c.request(method,path,body=json.dumps(body) if body is not None else None,headers=headers)
        r=c.getresponse();result=(r.status,dict(r.getheaders()),r.read());c.close();return result
    def test_capabilities_and_no_secrets(self):
        status,headers,body=self.req();self.assertEqual(status,200);self.assertEqual(headers['Access-Control-Allow-Origin'],ORIGIN)
        self.assertEqual(headers['Cache-Control'],'no-store');self.assertNotIn(TOKEN.encode(),body);self.assertNotIn(b'C:',body)
    def test_read_token_cannot_control(self):self.assertEqual(self.req(token=READ)[0],401)
    def test_control_token_cannot_monitor(self):self.assertEqual(self.req('/v1/status')[0],401)
    def test_wrong_origin_host(self):
        self.assertEqual(self.req(origin='https://evil.example')[0],403)
        self.assertEqual(self.req(extra={'Host':'evil.example'})[0],403)
    def test_disabled(self):
        self.server.control=None;self.assertEqual(self.req()[0],404)
    def test_json_and_method(self):
        body={'action':'lock','app_id':'','request_id':'test_request_0001'}
        self.assertEqual(self.req('/v1/control/challenge','POST',body,extra={'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.req('/v1/control/challenge','PUT',body)[0],405)
        self.assertEqual(self.req('/v1/control/challenge','POST',dict(body,path='cmd.exe'))[0],400)
        self.assertEqual(self.os.calls,[])
    def test_full_http_intent(self):
        body={'action':'launch','app_id':'notepad','request_id':'test_request_0001'}
        r=self.req('/v1/control/challenge','POST',body);self.assertEqual(r[0],200);i=json.loads(r[2]);del i['expires_in']
        self.assertEqual(self.req('/v1/control/execute','POST',i)[0],202)
        self.assertEqual(self.req('/v1/control/execute','POST',i)[0],409)
        for _ in range(50):
            r=self.req('/v1/control/result/'+i['request_id']);value=json.loads(r[2])
            if value['state']=='accepted_by_windows':break
            time.sleep(.01)
        self.assertEqual(value['state'],'accepted_by_windows');self.assertEqual(self.os.calls,[('launch','notepad')])
    def test_preflight(self):
        r=self.req('/v1/control/execute','OPTIONS',extra={'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type'})
        self.assertEqual(r[0],204);self.assertEqual(r[1]['Access-Control-Allow-Origin'],ORIGIN)
        self.assertEqual(self.req('/v1/control/execute','OPTIONS',origin='https://evil.example',extra={'Access-Control-Request-Method':'POST'})[0],403)
    def test_duplicate_boundary_headers(self):
        for header,value in [('Origin',ORIGIN),('Host','127.0.0.1:'+str(self.server.server_port))]:
            c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
            c.putrequest('GET','/v1/control',skip_host=True)
            c.putheader('Host','127.0.0.1:'+str(self.server.server_port));c.putheader('Origin',ORIGIN)
            c.putheader(header,value);c.putheader('Authorization','Bearer '+TOKEN);c.endheaders()
            r=c.getresponse();self.assertEqual(r.status,403);r.read();c.close()
    def test_invalid_json_and_body_limits(self):
        for body,code in [(b'{"action":"lock","action":"sleep"}',400),(b'{',400),(b'x'*1025,400)]:
            c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
            c.request('POST','/v1/control/challenge',body,{'Origin':ORIGIN,'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
            r=c.getresponse();self.assertEqual(r.status,code);r.read();c.close()
        self.assertEqual(self.os.calls,[])
    def test_duplicate_auth_headers(self):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        c.putrequest('GET','/v1/control');c.putheader('Origin',ORIGIN);c.putheader('Authorization','Bearer '+TOKEN);c.putheader('Authorization','Bearer '+TOKEN);c.endheaders()
        r=c.getresponse();self.assertEqual(r.status,401);r.read();c.close()

if __name__=='__main__':unittest.main()

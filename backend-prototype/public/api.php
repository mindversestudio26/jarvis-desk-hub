<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/core.php';
ini_set('display_errors','0');
ini_set('memory_limit','64M');
set_time_limit(10);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
function response(array $body,int $status=200): never { http_response_code($status);echo json_encode($body,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);exit; }
try {
    $c=config();$method=$_SERVER['REQUEST_METHOD'];$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
    if (($_SERVER['HTTP_HOST']??'')!==$c['host']) throw new ApiError(403,'Host rejected');
    if (!$c['local'] && ($_SERVER['HTTPS']??'')!=='on') throw new ApiError(426,'HTTPS required');
    if ($c['local'] && !in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true)) throw new ApiError(403,'Loopback development only');
    // Hosted authentication must not run with missing/broken private auditing.
    if (!$c['local'] && !security_event('request_started',200)) throw new RuntimeException('Private audit unavailable');
    if (!in_array($method,['GET','POST'],true)) throw new ApiError(405,'Method not allowed');
    $write=$method==='POST';$body=[];
    if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN']!==$c['origin']) throw new ApiError(403,'Origin rejected');
    if ($write) {
        if (($_SERVER['HTTP_ORIGIN']??'')!==$c['origin']) throw new ApiError(403,'Origin required');
        if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json') throw new ApiError(415,'JSON required');
        if ((int)($_SERVER['CONTENT_LENGTH']??0)>16384) throw new ApiError(413,'Request too large');
        $raw=file_get_contents('php://input',false,null,0,16385);
        if (strlen($raw)>16384) throw new ApiError(413,'Request too large');
        try {$body=json_decode($raw,true,16,JSON_THROW_ON_ERROR);} catch (JsonException) {throw new ApiError(400,'Invalid JSON');}
        if (!is_array($body) || !str_starts_with(ltrim($raw),'{')) throw new ApiError(400,'JSON object required');
    }
    $db=database($c);verify_storage($db);
    if ($path==='/api/v1/auth/login' && $write) {
        // Rate writes commit even when credential verification fails.
        transaction($db,function() use($db) {query($db,'DELETE FROM limits WHERE started < ?',[time()-86400]);limited($db,'login-ip:'.($_SERVER['REMOTE_ADDR']??''),10,900);limited($db,'login-global',100,900);});
        $owner=query($db,'SELECT * FROM owner WHERE id = ?',['owner'])->fetch();
        $password=$body['password']??'';$name=$body['username']??'';
        if (!is_string($password) || strlen($password)>72 || !is_string($name)) throw new ApiError(401,'Invalid credentials');
        $verified=$owner && password_verify($password,$owner['pw_hash']);
        if (!$verified || !hash_equals($owner['username'],$name)) throw new ApiError(401,'Invalid credentials');
        $device=text_field($body,'device_name',80);
        $token=bin2hex(random_bytes(32));$id=bin2hex(random_bytes(16));$expiry=time()+43200;
        $loginBinding=transaction($db,function() use($db,$token,$id,$expiry,$device,$owner) {
            $fresh=query($db,'SELECT pw_hash FROM owner WHERE id = ?',['owner'])->fetchColumn();
            if (!hash_equals($owner['pw_hash'],$fresh)) throw new ApiError(401,'Credentials changed; sign in again');
            query($db,'DELETE FROM sessions WHERE expires <= ? OR last_seen < ?',[time(),time()-1800]);
            if ((int)query($db,'SELECT COUNT(*) FROM sessions')->fetchColumn()>=20) throw new ApiError(429,'Session limit reached');
            query($db,'INSERT INTO sessions (id,token_hash,name,created,expires,last_seen) VALUES (?,?,?,?,?,?)',[$id,hash('sha256',$token),$device,time(),$expiry,time()]);
            return workspace_binding($db);
        });
        session_cookie($token,$c,$expiry);
        response(['identity'=>'owner','binding'=>$loginBinding,'session_id'=>$id,'csrf'=>csrf($token,$c),'expires'=>$expiry]);
    }
    $s=require_session($db,$c,$write);
    if ($path==='/api/v1/session' && !$write) response(session_view($db,$s));
    if ($path==='/api/v1/auth/logout' && $write) {revoke_session($db,$s,$s['id']);session_cookie('',$c,time()-3600);response(['ok'=>true]);}
    if ($path==='/api/v1/sessions' && !$write) response(['sessions'=>query($db,'SELECT id,name,created,expires,last_seen FROM sessions WHERE expires > ? AND last_seen > ?',[time(),time()-1800])->fetchAll()]);
    if ($path==='/api/v1/sessions/revoke' && $write) {revoke_session($db,$s,text_field($body,'id',36));security_event('session_revoked',200);response(['ok'=>true]);}
    if ($path==='/api/v1/sync' && $write) response(mutate($db,$c,$body,$s));
    if (($path==='/api/v1/sync' || $path==='/api/v1/memory') && !$write) {
        response(snapshot($db,$c,$s,$path==='/api/v1/memory'));
    }
    if ($path==='/api/v1/devices' && !$write) {
        $sessions=query($db,'SELECT id,name,last_seen FROM sessions WHERE expires > ?',[time()])->fetchAll();
        response(['devices'=>array_map(fn($d)=>['id'=>$d['id'],'name'=>$d['name'],'last_seen'=>(int)$d['last_seen'],'reachable'=>time()-(int)$d['last_seen']<90,'type'=>'browser session','cpu_percent'=>null,'gpu_percent'=>null,'ram_percent'=>null,'temperature_c'=>null],$sessions),'note'=>'Session activity only; not PC power state or hardware monitoring']);
    }
    if ($path==='/api/v1/ai' && $write) throw new ApiError(501,'AI provider not connected; no external data transmission or billing');
    if (str_starts_with($path,'/api/v1/control')) throw new ApiError(403,'Device control is not implemented or authorized');
    throw new ApiError(404,'Not found');
} catch (ApiError $e) { security_event('request_rejected',$e->status);response(['error'=>$e->getMessage()]+$e->details,$e->status); }
catch (Throwable) { security_event('internal_failure',503);response(['error'=>'Service unavailable; check server configuration'],503); }

<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/core.php';
require dirname(__DIR__).'/src/private-log.php';
require dirname(__DIR__).'/src/staging-gate.php';
$dir=getenv('JARVIS_RELEASE_TEST_DIR');
if (!$dir || !is_dir($dir)) exit(1);
$_SERVER['DOCUMENT_ROOT']=dirname(__DIR__).'/public';
$checks=[];
function release_check(bool $ok,string $name): void {global $checks;if(!$ok)throw new RuntimeException($name);$checks[]=$name;}
$now=time();$token=str_repeat('a',64);
$p=['created'=>$now-1,'expires'=>$now+300,'ips'=>['203.0.113.10'],'token_sha256'=>hash('sha256',$token)];
$s=['HTTPS'=>'on','HTTP_HOST'=>'jarvis-staging.glowwithimane.com','REMOTE_ADDR'=>'203.0.113.10','REQUEST_METHOD'=>'GET','REQUEST_URI'=>'/api/v1/session','HTTP_X_JANGE_STAGING_TOKEN'=>$token];
release_check(staging_gate_allows($p,$s,$now),'gate accepts exact peer, token, host, HTTPS and deadline');
foreach (['HTTPS'=>'off','HTTP_HOST'=>'evil.invalid','REMOTE_ADDR'=>'203.0.113.11','REQUEST_METHOD'=>'DELETE','REQUEST_URI'=>'/api/v1/control/shutdown','HTTP_X_JANGE_STAGING_TOKEN'=>'wrong'] as $key=>$value) release_check(!staging_gate_allows($p,[$key=>$value]+$s,$now),'gate rejects '.$key);
release_check(!staging_gate_allows($p,$s,$now+300),'expired gate denied');
release_check(!staging_gate_allows(['expires'=>$now+7201]+$p,$s,$now),'gate lifetime bounded');
release_check(!staging_gate_allows($p,['REMOTE_ADDR'=>'203.0.113.11','HTTP_X_FORWARDED_FOR'=>'203.0.113.10']+$s,$now),'forwarded peer spoof rejected');
release_check(!staging_gate_allows($p,['REQUEST_URI'=>'/api/v1/session?token='.$token]+$s,$now),'query credential path rejected');
release_check(!staging_gate_allows([],$s,$now),'missing policy denied');
release_check(private_audit($dir,'request_rejected',403),'private audit write');
release_check(private_audit($dir,'password_changed_sessions_revoked',200),'password-change audit supported');
release_check(str_contains(file_get_contents($dir.'/audit.jsonl'),'password_changed_sessions_revoked'),'password-change event emitted');
release_check(!private_audit($dir,'password=fixture-secret',403),'unrecognized metadata rejected');
release_check(!private_audit(dirname(__DIR__).'/public','request_rejected',403),'public log directory rejected');
// Force multiple rotations using only owned disposable fixture files.
for($i=0;$i<1900;$i++)release_check(private_audit($dir,'request_started',200),'bounded write');
$files=glob($dir.'/audit.jsonl*');
release_check(count($files)===3,'bounded three-segment rotation');
foreach($files as $file){release_check(filesize($file)<=65536,'segment size bound');foreach(file($file,FILE_IGNORE_NEW_LINES) as $line){$row=json_decode($line,true,8,JSON_THROW_ON_ERROR);if(array_keys($row)!==['component','event','status','time'])throw new RuntimeException('Log schema');}release_check(!str_contains(file_get_contents($file),'fixture-secret'),'no arbitrary sensitive metadata');}
// Parallel writers are orchestrated by the Python regression.
echo json_encode(['result'=>'PASS','checks'=>array_values(array_unique($checks))],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);

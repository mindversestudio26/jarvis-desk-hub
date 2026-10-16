<?php
declare(strict_types=1);
// Private CLI fixture only. Never place in public_html or expose through HTTP.
if (PHP_SAPI!=='cli') {http_response_code(403);exit;}
umask(0077);
$root=dirname(__DIR__);$report=['component'=>'JANGE private core verification','checks'=>[],'http_tests'=>'NOT RUN'];
$stage='bootstrap';$claim=null;$privateReady=false;
function fixture_check(bool $ok,string $name): void {
    global $report;
    if (!$ok) throw new RuntimeException('Fixture check failed');
    $report['checks'][]=$name;
}
try {
    $public=realpath($root.'/../public_html');
    if (!$public || str_starts_with(strtolower($root).DIRECTORY_SEPARATOR,strtolower($public).DIRECTORY_SEPARATOR)) throw new RuntimeException('Private layout required');
    $_SERVER['DOCUMENT_ROOT']=$public;
    if (!chmod($root,0700)) throw new RuntimeException('Private directory permissions required');
    $privateReady=true;
    $report['php']=PHP_VERSION;
    fixture_check(PHP_VERSION_ID>=80300 && PHP_VERSION_ID<80400,'PHP 8.3 runtime');
    fixture_check(extension_loaded('sodium'),'native sodium');
    fixture_check(extension_loaded('pdo_mysql'),'PDO MySQL available');
    // Generate the key on the host, never in browser code, chat or Git.
    if (!getenv('JARVIS_DATA_KEY') && !is_file($root.'/data.key')) {
        $keyFile=fopen($root.'/data.key','xb');
        if (!$keyFile) throw new RuntimeException('Exclusive key creation required');
        try {if(fwrite($keyFile,random_bytes(32))!==32 || !fflush($keyFile)) throw new RuntimeException('Key write failed');} finally {fclose($keyFile);}
    }
    foreach (['data.key','db-password.txt','config.local.php'] as $name) if (is_file($root.'/'.$name) && (is_link($root.'/'.$name) || !chmod($root.'/'.$name,0600))) throw new RuntimeException('Private file permissions required');
    require $root.'/src/core.php';
    $c=config();
    $stage='cipher';
    $value=['text'=>'जङ्गे synthetic encryption fixture'];$box=encrypt_value($value,'jange-hosted-fixture',$c);
    fixture_check(decrypt_value($box,'jange-hosted-fixture',$c)===$value,'native authenticated encryption roundtrip');
    $raw=base64_decode($box,true);$raw[30]=chr(ord($raw[30])^1);$rejected=false;
    try{decrypt_value(base64_encode($raw),'jange-hosted-fixture',$c);}catch(RuntimeException){$rejected=true;}
    fixture_check($rejected,'ciphertext tamper rejected');
    $stage='database';$db=database($c);verify_storage($db);
    fixture_check($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql','real PDO MySQL connection');
    $name=$db->query('SELECT DATABASE()')->fetchColumn();
    $local=$c['local'] && preg_match('/^mysql:host=127\.0\.0\.1;port=[0-9]+;dbname=jarvis_test_[a-f0-9]+;charset=utf8mb4$/D',$c['dsn']);
    fixture_check((bool)preg_match('/^[a-z0-9]+_jarvis_verify$/D',$name) || (bool)$local,'disposable verification target only');
    $report['database_version']=$db->query('SELECT VERSION()')->fetchColumn();
    $privileges=query($db,'SELECT PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES WHERE TABLE_SCHEMA=DATABASE() ORDER BY PRIVILEGE_TYPE')->fetchAll(PDO::FETCH_COLUMN);
    $report['schema_privileges']=$privileges;
    $allowed=['DELETE','DELETE HISTORY','INSERT','SELECT','SHOW CREATE ROUTINE','UPDATE'];
    fixture_check(!array_diff($privileges,$allowed) && !array_diff(['DELETE','INSERT','SELECT','UPDATE'],$privileges),'runtime schema grants restricted to DML and declared host metadata/history grants');
    $global=query($db,'SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES')->fetchAll(PDO::FETCH_COLUMN);
    fixture_check(!array_diff($global,['USAGE']),'no global database privileges');
    $stage='claim';$claim=@fopen($root.'/run.claim','xb');
    if (!$claim) {echo "JANGE verification already claimed; inspect private result.json.\n";exit;}
    fixture_check(fwrite($claim,"JANGE disposable verification\n")!==false,'exclusive one-shot claim');
    // All five tables must be empty before initialization: no reuse/overwrite.
    $stage='empty-target';
    foreach (['owner','records','operations','sessions','limits'] as $table) fixture_check((int)query($db,'SELECT COUNT(*) FROM '.$table)->fetchColumn()===0,'empty '.$table);
    transaction($db,function() use($db){query($db,'INSERT INTO owner (id,username,pw_hash,revision,subject_id,workspace_id,generation) VALUES (?,?,?,0,?,?,?)',['owner','synthetic-fixture',password_hash(bin2hex(random_bytes(24)),PASSWORD_BCRYPT,['cost'=>12]),bin2hex(random_bytes(16)),bin2hex(random_bytes(16)),bin2hex(random_bytes(16))]);});
    $stage='transactions';$revision=(int)query($db,'SELECT revision FROM owner')->fetchColumn();
    try{transaction($db,function() use($db){query($db,'UPDATE owner SET revision=revision+1');throw new RuntimeException('Fixture rollback');});}catch(RuntimeException){}
    fixture_check((int)query($db,'SELECT revision FROM owner')->fetchColumn()===$revision,'PDO transaction rollback');
    $binding=workspace_binding($db);
    $op=['binding'=>$binding,'operation_id'=>'a1111111-1111-4111-8111-111111111111','kind'=>'task','id'=>'hosted-fixture','base_revision'=>0,'deleted'=>false,'data'=>['text'=>'जङ्गे private PDO fixture','done'=>false]];
    $first=mutate($db,$c,$op);fixture_check(mutate($db,$c,$op)===$first,'idempotent retry');
    $deletion=$op;$deletion['operation_id']='a2222222-2222-4222-8222-222222222222';$deletion['base_revision']=$first['record']['revision'];$deletion['deleted']=true;
    mutate($db,$c,$deletion);fixture_check(mutate($db,$c,$op)['record']['deleted']===true,'retry cannot resurrect deletion');
    $stale=$op;$stale['operation_id']='a3333333-3333-4333-8333-333333333333';$status=0;
    try{mutate($db,$c,$stale);}catch(ApiError $e){$status=$e->status;}fixture_check($status===409,'stale write preserves conflict');
    query($db,'UPDATE owner SET generation=?',[bin2hex(random_bytes(16))]);$status=0;
    try{mutate($db,$c,$op);}catch(ApiError $e){$status=$e->status;}fixture_check($status===412,'old generation rejected before retry lookup');
    $stage='sessions';$token=bin2hex(random_bytes(32));$id=bin2hex(random_bytes(16));$hash=hash('sha256',$token);
    query($db,'INSERT INTO sessions (id,token_hash,name,created,expires,last_seen) VALUES (?,?,?,?,?,?)',[$id,$hash,'synthetic private session',time(),time()+300,time()]);
    $_COOKIE[$c['cookie']]=$token;$_SERVER['HTTP_X_CSRF_TOKEN']='invalid';$status=0;
    try{require_session($db,$c,true);}catch(ApiError $e){$status=$e->status;}fixture_check($status===403,'core session CSRF mismatch rejected');
    $_SERVER['HTTP_X_CSRF_TOKEN']=csrf($token,$c);$session=require_session($db,$c,true);fixture_check($session['id']===$id,'core session authenticates hashed token');
    query($db,'UPDATE sessions SET expires=? WHERE id=?',[time()-1,$id]);$status=0;
    try{require_session($db,$c,false);}catch(ApiError $e){$status=$e->status;}fixture_check($status===401,'core session expiry');
    query($db,'UPDATE sessions SET expires=? WHERE id=?',[time()+300,$id]);revoke_session($db,$session,$id);$status=0;
    try{assert_session_active($db,$session);}catch(ApiError $e){$status=$e->status;}fixture_check($status===401,'loaded session revoked');
    $stage='lock';$second=database($c);$second->exec('SET SESSION innodb_lock_wait_timeout=1');$blocked=false;
    transaction($db,function() use($second,&$blocked){try{transaction($second,fn()=>null);}catch(PDOException $e){$blocked=(int)($e->errorInfo[1]??0)===1205;}});
    fixture_check($blocked,'independent PDO connection respects owner lock');
    $stage='complete';$report['result']='PASS';
}catch(Throwable){$report['result']='FAIL';$report['failed_stage']=$stage;}
finally{
    if(is_resource($claim))fclose($claim);
    // No credentials, identities, record bodies or raw exception strings.
    $json=json_encode($report,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE);
    if($privateReady && !is_link($root.'/result.json') && file_put_contents($root.'/result.json',$json,LOCK_EX)!==false)chmod($root.'/result.json',0600);
    echo $json.PHP_EOL;
}
exit(($report['result']??'FAIL')==='PASS'?0:1);

<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/core.php';
$c=config();$db=database($c);
$action=$argv[1]??'';
if ($action==='bootstrap') {
    $name=getenv('JARVIS_TEST_DB');$restore=getenv('JARVIS_TEST_RESTORE_DB');
    foreach ([$name,$restore] as $value) if (!preg_match('/^jarvis_test_[a-f0-9]+$/D',$value)) throw new RuntimeException('Disposable database only');
    foreach ([$name,$restore] as $value) $db->exec('CREATE DATABASE '.$value.' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
    $user=getenv('JARVIS_TEST_USER');$password=getenv('JARVIS_TEST_PASSWORD');
    if (!preg_match('/^jv_[a-f0-9]+$/D',$user) || !preg_match('/^[a-f0-9]+$/D',$password)) throw new RuntimeException('Synthetic fixture only');
    $db->exec("CREATE USER '".$user."'@'127.0.0.1' IDENTIFIED BY '".$password."'");
    $db->exec("GRANT SELECT,INSERT,UPDATE,DELETE ON ".$name.".* TO '".$user."'@'127.0.0.1'");
    echo 'bootstrap';exit;
}
verify_storage($db);
function check(bool $condition): void {if (!$condition) throw new RuntimeException('MySQL contract failed');}
if ($action==='inspect') {
    $result=[];
    foreach (['owner','records','operations'] as $table) $result[$table]=query($db,'SELECT * FROM '.$table.' ORDER BY 1,2')->fetchAll();
    echo json_encode($result,JSON_THROW_ON_ERROR);exit;
}
if ($action==='write') {
    try {mutate($db,$c,json_decode(getenv('JARVIS_TEST_OPERATION'),true,16,JSON_THROW_ON_ERROR));echo '200';}
    catch(ApiError $e){echo $e->status;}exit;
}
if ($action==='contract') {
    $before=query($db,'SELECT revision FROM owner')->fetchColumn();
    try {transaction($db,function() use($db){query($db,'UPDATE owner SET revision=revision+1');throw new RuntimeException('Synthetic rollback');});}catch(RuntimeException){}
    check(query($db,'SELECT revision FROM owner')->fetchColumn()===$before);
    $op=['binding'=>workspace_binding($db),'operation_id'=>'11111111-1111-4111-8111-111111111111','kind'=>'task','id'=>'nepali-fixture','base_revision'=>0,'deleted'=>false,'data'=>['text'=>'नेपाली InnoDB fixture','done'=>false]];
    $first=mutate($db,$c,$op);$retry=mutate($db,$c,$op);check($first===$retry);
    $deleted=$op;$deleted['operation_id']='22222222-2222-4222-8222-222222222222';$deleted['base_revision']=$first['record']['revision'];$deleted['deleted']=true;
    $tombstone=mutate($db,$c,$deleted);check(mutate($db,$c,$op)['record']['deleted']===true);
    $stale=$op;$stale['operation_id']='33333333-3333-4333-8333-333333333333';
    try {mutate($db,$c,$stale);throw new RuntimeException('Missing conflict');}catch(ApiError $e){check($e->status===409);}
    $id=str_repeat('a',32);$hash=str_repeat('b',64);query($db,'INSERT INTO sessions (id,token_hash,name,created,expires,last_seen) VALUES (?,?,?,?,?,?)',[$id,$hash,'synthetic',time(),time()+60,time()]);
    $s=query($db,'SELECT * FROM sessions WHERE id=?',[$id])->fetch();query($db,'DELETE FROM sessions WHERE id=?',[$id]);
    try {mutate($db,$c,$stale,$s);throw new RuntimeException('Revocation bypass');}catch(ApiError $e){check($e->status===401);}
    try {$db->exec('CREATE TABLE forbidden_probe (id INT)');throw new RuntimeException('Runtime DDL allowed');}catch(PDOException){}
    foreach(query($db,'SELECT * FROM records')->fetchAll() as $r) decrypt_value($r['box'],record_context($r),$c);
    echo json_encode(['version'=>$db->query('SELECT VERSION()')->fetchColumn(),'checks'=>['InnoDB/utf8mb4_bin','rollback','Unicode ciphertext','idempotency','tombstone retry','stale conflict','revoked loaded session','runtime DDL denied']]);exit;
}
throw new RuntimeException('Unsupported fixture action');

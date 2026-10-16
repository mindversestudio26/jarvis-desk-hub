<?php
declare(strict_types=1);
// Read-only preparation audit. Never prints keys, account names, paths or bodies.
if(PHP_SAPI!=='cli')exit(1);
require dirname(__DIR__).'/src/core.php';
$result=['component'=>'JANGE release audit','key_recovery'=>'NOT VERIFIED','hosted_https'=>'NOT VERIFIED','hosted_restore'=>'NOT VERIFIED'];
try {
    $c=config();$db=database($c);verify_storage($db);
    if($db->getAttribute(PDO::ATTR_DRIVER_NAME)!=='mysql')throw new RuntimeException();
    $result['schema_privileges']=query($db,'SELECT PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES WHERE TABLE_SCHEMA=DATABASE() ORDER BY PRIVILEGE_TYPE')->fetchAll(PDO::FETCH_COLUMN);
    $result['exact_runtime_dml']=$result['schema_privileges']===['DELETE','INSERT','SELECT','UPDATE'];
    $global=query($db,'SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES')->fetchAll(PDO::FETCH_COLUMN);
    $result['visible_global_grants_absent']=!array_diff($global,['USAGE']);
    $result['routines']=(int)query($db,'SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()')->fetchColumn();
    $root=dirname(__DIR__);$result['private_files']=[];
    foreach(['config.local.php','data.key','db-password.txt'] as $name){$path=$root.'/'.$name;$mode=is_file($path)?fileperms($path)&0777:null;$result['private_files'][$name]=!is_link($path) && $mode===0600;}
    $result['key_file_32_bytes']=is_file($root.'/data.key') && filesize($root.'/data.key')===32;
    $log=setting('JARVIS_SECURITY_LOG_DIR');
    $result['private_log_directory']=false;
    if($log!=='' && !is_link($log)){private_directory($log);$result['private_log_directory']=(fileperms($log)&0777)===0700 && is_writable($log);}
    $result['preparation_ok']=$result['exact_runtime_dml'] && $result['visible_global_grants_absent'] && $result['private_log_directory'] && !in_array(false,$result['private_files'],true) && $result['key_file_32_bytes'];
}catch(Throwable){$result['preparation_ok']=false;}
// Manual recovery/HTTPS/restore evidence cannot be inferred from filesystem checks.
$result['production_ready']=false;
echo json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
exit(($result['preparation_ok']??false)?0:1);

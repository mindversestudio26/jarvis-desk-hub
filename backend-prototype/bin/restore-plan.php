<?php
declare(strict_types=1);
// Read-only archive validation. No database connection, SQL, restore or key output.
if(PHP_SAPI!=='cli')exit(1);
require dirname(__DIR__).'/src/core.php';
$report=['component'=>'JANGE hosted restore preparation','writes'=>false,'restore'=>'NOT RUN'];
try {
    $path=$argv[1]??'';$target=$argv[2]??'';
    if(!preg_match('/^[a-z0-9]+_jarvis_restore$/D',$target))throw new RuntimeException();
    private_directory(dirname($path));
    if(is_link($path) || !is_file($path) || filesize($path)>134217728)throw new RuntimeException();
    $c=config();$archive=decrypt_value(file_get_contents($path),'jarvis-backup-v1',$c);
    if(($archive['format']??null)!==2 || array_keys($archive['tables']??[])!==['owner','records','operations'] || count($archive['tables']['owner'])!==1)throw new RuntimeException();
    $owner=$archive['tables']['owner'][0];
    foreach(['subject_id','workspace_id','generation'] as $field)if(!preg_match('/^[a-f0-9]{32}$/D',$owner[$field]??''))throw new RuntimeException();
    foreach($archive['tables']['records'] as $row)decrypt_value($row['box'],record_context($row),$c);
    foreach($archive['tables']['operations'] as $row)decrypt_value($row['box'],'operation:'.$row['id'],$c);
    $report+=['integrity'=>'PASS','format'=>2,'record_count'=>count($archive['tables']['records']),'operation_count'=>count($archive['tables']['operations']),'identity_preserved_on_future_restore'=>true,'fresh_generation_required'=>true,'sessions_excluded'=>true,'target_namespace'=>'separate jarvis_restore only','target_empty'=>'NOT VERIFIED','approval'=>'REQUIRED before provisioning or restoration'];
}catch(Throwable){$report['integrity']='FAIL';}
echo json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
exit($report['integrity']==='PASS'?0:1);

<?php
declare(strict_types=1);
// Private synthetic export verification only; no hosted restore permission.
if (PHP_SAPI!=='cli') {http_response_code(403);exit;}
umask(0077);
$root=dirname(__DIR__);$ready=false;$claim=null;$report=['component'=>'JANGE private backup verification','checks'=>[],'restore'=>'NOT RUN'];
try {
    $public=realpath($root.'/../public_html');
    if (!$public || str_starts_with(strtolower($root).DIRECTORY_SEPARATOR,strtolower($public).DIRECTORY_SEPARATOR) || !chmod($root,0700)) throw new RuntimeException('Private layout required');
    $_SERVER['DOCUMENT_ROOT']=$public;$ready=true;
    $claim=@fopen($root.'/backup.claim','xb');
    if (!$claim) {echo "JANGE backup verification already claimed; inspect private report.\n";exit;}
    if (fwrite($claim,"JANGE private backup verification\n")===false || !fflush($claim)) throw new RuntimeException('Claim write failed');
    // Gate the target before the existing export command can connect.
    $private=is_file($root.'/config.local.php')?require $root.'/config.local.php':[];
    $dsn=getenv('JARVIS_DSN')!==false?getenv('JARVIS_DSN'):($private['JARVIS_DSN']??'');
    $local=getenv('JARVIS_LOCAL_DEV')==='1';
    $hosted=preg_match('/^mysql:host=127\.0\.0\.1;dbname=[a-z0-9]+_jarvis_verify;charset=utf8mb4$/D',$dsn);
    $loopback=$local && preg_match('/^mysql:host=127\.0\.0\.1;port=[0-9]+;dbname=jarvis_test_[a-f0-9]+;charset=utf8mb4$/D',$dsn);
    if (!$hosted && !$loopback) throw new RuntimeException('Disposable database required');
    $archive=$root.'/fixture.backup';
    if (file_exists($archive) || is_link($archive)) throw new RuntimeException('Exclusive archive required');
    $argv=['backup.php','export',$archive];
    ob_start();
    require $root.'/bin/backup.php';
    ob_end_clean();
    $report['checks'][]='existing CLI encrypted export completed';
    if (!is_file($archive) || is_link($archive) || !chmod($archive,0600)) throw new RuntimeException('Private archive required');
    $box=file_get_contents($archive);$data=decrypt_value($box,'jarvis-backup-v1',$c);
    if (($data['format']??null)!==2 || array_keys($data['tables']??[])!==['owner','records','operations']) throw new RuntimeException('Archive shape');
    $report['checks'][]='archive authentication and format 2';
    foreach (['owner','records','operations'] as $table) {
        $current=query($db,'SELECT * FROM '.$table)->fetchAll();
        if ($data['tables'][$table]!==$current) throw new RuntimeException('Archive source differs');
    }
    $report['checks'][]='owner, encrypted records and retry history match source';
    $report['checks'][]='sessions and rate buckets excluded';
    foreach ($data['tables']['records'] as $row) decrypt_value($row['box'],record_context($row),$c);
    foreach ($data['tables']['operations'] as $row) decrypt_value($row['box'],'operation:'.$row['id'],$c);
    $report['checks'][]='nested record and retry ciphertext authenticated';
    $raw=base64_decode($box,true);$raw[30]=chr(ord($raw[30])^1);$rejected=false;
    try {decrypt_value(base64_encode($raw),'jarvis-backup-v1',$c);}catch(RuntimeException){$rejected=true;}
    if (!$rejected) throw new RuntimeException('Tamper accepted');
    $report['checks'][]='archive tamper rejected';
    if (file_get_contents($archive)!==$box) throw new RuntimeException('Archive changed');
    $report['checks'][]='archive unchanged after verification';
    $report['result']='PASS';
}catch(Throwable){while(ob_get_level())ob_end_clean();$report['result']='FAIL';}
$json=json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);
if (is_resource($claim)) fclose($claim);
if ($ready && !is_link($root.'/backup-result.json')) {file_put_contents($root.'/backup-result.json',$json,LOCK_EX);chmod($root.'/backup-result.json',0600);}
echo $json.PHP_EOL;
exit($report['result']==='PASS'?0:1);

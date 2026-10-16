<?php
declare(strict_types=1);
// Read-only CLI diagnostics: never publish as a web endpoint.
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__).'/src/core.php';
$result=['php'=>PHP_VERSION,'php83'=>PHP_VERSION_ID>=80300 && PHP_VERSION_ID<80400,'extensions'=>[]];
foreach (['PDO','pdo_mysql','sodium','openssl'] as $extension) $result['extensions'][$extension]=extension_loaded($extension);
try {
    $c=config();
    if (str_starts_with($c['dsn'],'sqlite:') && !is_file(substr($c['dsn'],7))) throw new RuntimeException('Existing database required');
    $db=database($c);$driver=$db->getAttribute(PDO::ATTR_DRIVER_NAME);
    $result['driver']=$driver;
    if ($driver==='mysql') {
        $result['version']=$db->query('SELECT VERSION()')->fetchColumn();
        $tables=$db->query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('owner','sessions','records','operations','limits')")->fetchAll();
        $result['all_tables_innodb']=count($tables)===5 && count(array_filter($tables,fn($t)=>strtoupper($t['ENGINE'])!=='INNODB'))===0;
        verify_storage($db);
        $result['storage_contract']=true;
    }
    $result['connected']=true;
    query($db,'SELECT subject_id,workspace_id,generation FROM owner LIMIT 0');
    $result['binding_schema']=true;
    $result['owner_initialized']=(int)query($db,'SELECT COUNT(*) FROM owner')->fetchColumn()===1;
    if ($result['owner_initialized']) workspace_binding($db);
} catch (Throwable) {$result['connected']=false;}
$result['ready']=($result['connected']??false) && ($result['binding_schema']??false) && ($result['owner_initialized']??false);
echo json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
// A reachable legacy/empty DB is not ready.
exit($result['ready']?0:1);

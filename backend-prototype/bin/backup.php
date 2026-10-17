<?php
declare(strict_types=1);
// CLI only. Export encrypted records and retry history; never session credentials.
if (PHP_SAPI!=='cli') exit(1);
require dirname(__DIR__).'/src/core.php';
const MAX_BACKUP_BYTES=134217728; // Same bound for export and restore.
try {
    $c=config();$db=database($c);$action=$argv[1]??'';$path=$argv[2]??'';
    private_directory(dirname($path));
    $tables=['owner','records','operations'];
    if ($action==='export') {
        verify_storage($db);
        $data=transaction($db,function() use($db,$tables) {
            $data=['format'=>2,'tables'=>[]];
            foreach ($tables as $table) $data['tables'][$table]=query($db,'SELECT * FROM '.$table)->fetchAll();
            return $data;
        });
        if (count($data['tables']['owner'])!==1) throw new RuntimeException('Initialized owner required');
        if (!isset($data['tables']['owner'][0]['workspace_id'])) $data['format']=1;
        $box=encrypt_value($data,'jarvis-backup-v1',$c);
        if (strlen($box)>MAX_BACKUP_BYTES) throw new RuntimeException('Backup exceeds supported archive size');
        $old=umask(0077);
        try {$file=fopen($path,'xb');} finally {umask($old);}
        if (!$file) throw new RuntimeException('New backup path required');
        try {
            if (fwrite($file,$box)!==strlen($box) || !fflush($file)) throw new RuntimeException('Backup write failed');
        } finally {fclose($file);}
        echo "Encrypted export created; preserve the data key separately.\n";
    } elseif ($action==='restore-local') {
        // No production restore. MySQL drills require this exact local DSN and
        // a disposable database namespace, in addition to an empty target.
        $driver=$db->getAttribute(PDO::ATTR_DRIVER_NAME);
        $localMysql=$driver==='mysql' && preg_match('/^mysql:host=127\.0\.0\.1;port=[0-9]+;dbname=jarvis_test_[a-f0-9]+;charset=utf8mb4$/D',$c['dsn']);
        if (!$c['local'] || ($driver!=='sqlite' && !$localMysql)) throw new RuntimeException('Restore limited to isolated local drills');
        if (!is_file($path) || filesize($path)>MAX_BACKUP_BYTES) throw new RuntimeException('Invalid backup size');
        $archiveConfig=$c;
        $archiveKey=setting('JARVIS_BACKUP_DATA_KEY');
        if ($archiveKey!=='') {
            $decoded=base64_decode($archiveKey,true);
            if ($decoded===false || strlen($decoded)!==32) throw new RuntimeException('Invalid archive key');
            $archiveConfig['key']=$decoded;
        }
        $data=decrypt_value(file_get_contents($path),'jarvis-backup-v1',$archiveConfig);
        if (!in_array($data['format']??null,[1,2],true) || array_keys($data['tables']??[])!==$tables || count($data['tables']['owner'])!==1) throw new RuntimeException('Invalid backup format');
        foreach ($data['tables']['records'] as &$row) { $value=decrypt_value($row['box'],record_context($row),$archiveConfig);if (!hash_equals($c['key'],$archiveConfig['key'])) $row['box']=encrypt_value($value,record_context($row),$c); }
        unset($row);
        foreach ($data['tables']['operations'] as &$row) { $value=decrypt_value($row['box'],'operation:'.$row['id'],$archiveConfig);if (!hash_equals($c['key'],$archiveConfig['key'])) $row['box']=encrypt_value($value,'operation:'.$row['id'],$c); }
        unset($row);
        $owner=&$data['tables']['owner'][0];
        if ($data['format']===1) { $owner['subject_id']=bin2hex(random_bytes(16));$owner['workspace_id']=bin2hex(random_bytes(16)); }
        foreach (['subject_id','workspace_id'] as $field) if (!preg_match('/^[a-f0-9]{32}$/D',$owner[$field]??'')) throw new RuntimeException('Invalid binding');
        $owner['generation']=bin2hex(random_bytes(16));
        unset($owner);
        $db->exec(file_get_contents(dirname(__DIR__).($driver==='mysql'?'/schema.mysql.sql':'/schema.sql')));
        verify_storage($db);
        transaction($db,function() use($db,$data,$tables) {
            foreach (array_merge($tables,['sessions','limits']) as $table) if ((int)query($db,'SELECT COUNT(*) FROM '.$table)->fetchColumn()!==0) throw new RuntimeException('Restore target must be empty');
            $columns=['owner'=>['id','username','pw_hash','revision','subject_id','workspace_id','generation'],'records'=>['kind','id','revision','deleted','box','size','updated'],'operations'=>['id','request_hash','box','created']];
            foreach ($tables as $table) foreach ($data['tables'][$table] as $row) {
                if (array_diff(array_keys($row),$columns[$table]) || array_diff($columns[$table],array_keys($row))) throw new RuntimeException('Invalid backup columns');
                query($db,'INSERT INTO '.$table.' ('.implode(',',$columns[$table]).') VALUES ('.implode(',',array_fill(0,count($columns[$table]),'?')).')',array_map(fn($key)=>$row[$key],$columns[$table]));
            }
        });
        echo "Local restore completed; sessions and rate buckets were not restored.\n";
    } else throw new RuntimeException('Use export or restore-local with a private file path');
} catch (Throwable) {
    fwrite(STDERR,"Backup operation failed; no secrets printed. Verify configuration, archive and empty target.\n");exit(1);
}

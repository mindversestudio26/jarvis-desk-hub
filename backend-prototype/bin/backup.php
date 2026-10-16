<?php
declare(strict_types=1);
// CLI only. Export encrypted records and retry history; never session credentials.
if (PHP_SAPI!=='cli') exit(1);
require dirname(__DIR__).'/src/core.php';
const MAX_BACKUP_BYTES=134217728; // Same bound for export and restore.
try {
    $c=config();$db=database($c);$action=$argv[1]??'';$path=$argv[2]??'';
    $directory=realpath(dirname($path));$public=realpath(dirname(__DIR__).'/public');
    if (!$directory || !$public || str_starts_with(strtolower($directory).DIRECTORY_SEPARATOR,strtolower($public).DIRECTORY_SEPARATOR)) throw new RuntimeException('Private backup path required');
    $tables=['owner','records','operations'];
    if ($action==='export') {
        $data=transaction($db,function() use($db,$tables) {
            $data=['format'=>1,'tables'=>[]];
            foreach ($tables as $table) $data['tables'][$table]=query($db,'SELECT * FROM '.$table)->fetchAll();
            return $data;
        });
        if (count($data['tables']['owner'])!==1) throw new RuntimeException('Initialized owner required');
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
        // No production restore path until workspace generations/MySQL drills exist.
        if (!$c['local'] || $db->getAttribute(PDO::ATTR_DRIVER_NAME)!=='sqlite') throw new RuntimeException('Restore limited to isolated local SQLite drills');
        if (!is_file($path) || filesize($path)>MAX_BACKUP_BYTES) throw new RuntimeException('Invalid backup size');
        $data=decrypt_value(file_get_contents($path),'jarvis-backup-v1',$c);
        if (($data['format']??null)!==1 || array_keys($data['tables']??[])!==$tables || count($data['tables']['owner'])!==1) throw new RuntimeException('Invalid backup format');
        foreach ($data['tables']['records'] as $row) decrypt_value($row['box'],record_context($row),$c);
        foreach ($data['tables']['operations'] as $row) decrypt_value($row['box'],'operation:'.$row['id'],$c);
        $db->exec(file_get_contents(dirname(__DIR__).'/schema.sql'));
        transaction($db,function() use($db,$data,$tables) {
            foreach (array_merge($tables,['sessions','limits']) as $table) if ((int)query($db,'SELECT COUNT(*) FROM '.$table)->fetchColumn()!==0) throw new RuntimeException('Restore target must be empty');
            $columns=['owner'=>['id','username','pw_hash','revision'],'records'=>['kind','id','revision','deleted','box','size','updated'],'operations'=>['id','request_hash','box','created']];
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

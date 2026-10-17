<?php
declare(strict_types=1);
// Fixed metadata only. Never fall back to an account-wide log on failure.
function private_audit(string $directory,string $event,int $status): bool {
    if (!in_array($event,['request_started','request_rejected','internal_failure','session_revoked','password_changed_sessions_revoked'],true) || $status<100 || $status>599) return false;
    $lock=null;$file=null;$mask=umask(0077);
    try {
        if (is_link($directory)) return false;
        $directory=private_directory($directory);
        if (!chmod($directory,0700)) return false;
        if (is_link($directory.'/audit.lock') || (file_exists($directory.'/audit.lock') && (!is_file($directory.'/audit.lock') || !chmod($directory.'/audit.lock',0600)))) return false;
        $lock=@fopen($directory.'/audit.lock','c');
        if (!$lock || !flock($lock,LOCK_EX)) return false;
        foreach (['audit.jsonl','audit.jsonl.1','audit.jsonl.2'] as $name) {
            $path=$directory.'/'.$name;
            if (is_link($path) || (file_exists($path) && (!is_file($path) || !chmod($path,0600)))) return false;
        }
        $path=$directory.'/audit.jsonl';clearstatcache(true,$path);
        $line=json_encode(['component'=>'jarvis-api','event'=>$event,'status'=>$status,'time'=>gmdate('c')],JSON_THROW_ON_ERROR)."\n";
        if (is_file($path) && filesize($path)+strlen($line)>65536) {
            if (is_file($path.'.2') && !unlink($path.'.2')) return false;
            if (is_file($path.'.1') && !rename($path.'.1',$path.'.2')) return false;
            if (!rename($path,$path.'.1')) return false;
        }
        $file=@fopen($path,'ab');
        return $file && chmod($path,0600) && fwrite($file,$line)===strlen($line) && fflush($file);
    } catch(Throwable) {return false;}
    finally {if(is_resource($file))fclose($file);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}umask($mask);}
}

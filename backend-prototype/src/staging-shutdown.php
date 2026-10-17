<?php
declare(strict_types=1);
// Pinned to the observed, unchanged 256-byte staging deny-all rule, not a secret.
const JANGE_ORIGINAL_GATE_SHA256='de66a4e53c9cca539e0388249a8c5a01fe3cceafa3c96d39d4371ecb7be77413';

function staging_shutdown(string $root,int $now): array {
    $lock=null;$temp=null;$mask=umask(0077);
    try {
        // No configurable target paths and no writes outside the dedicated site.
        if (is_link($root) || is_link(dirname($root))) throw new RuntimeException();
        $root=realpath($root);
        if (!$root || basename($root)!=='.jange-http' || basename(dirname($root))!=='jarvis-staging.glowwithimane.com') throw new RuntimeException();
        $public=dirname($root).'/public_html';
        if (is_link($public) || !is_dir($public) || str_replace('\\','/',realpath($public))!==str_replace('\\','/',$public)) throw new RuntimeException();
        if (!chmod($root,0700) || is_link($root.'/shutdown.lock')) throw new RuntimeException();
        $lock=@fopen($root.'/shutdown.lock','c');
        if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) throw new RuntimeException();
        $manifest=[];$file=$root.'/window.json';
        if (is_file($file) && !is_link($file) && filesize($file)<=4096) {
            try {$manifest=json_decode(file_get_contents($file),true,8,JSON_THROW_ON_ERROR);}catch(Throwable){}
        }
        if (!is_array($manifest)) $manifest=[];
        $created=$manifest['created']??null;$expires=$manifest['expires']??null;
        $valid=is_int($created) && is_int($expires) && $expires>$created && $expires-$created<=7200;
        $backup=$root.'/original.htaccess';$original=null;
        if (!is_link($backup) && is_file($backup) && filesize($backup)===256) {
            $candidate=file_get_contents($backup);
            if(hash_equals(JANGE_ORIGINAL_GATE_SHA256,hash('sha256',$candidate)))$original=$candidate;
        }
        if ($valid && $now>=$created && $now<$expires && $original!==null) return ['state'=>'ARMED','original_backup_verified'=>true];
        // Corrupt/missing policy, clock reversal or missing backup closes access.
        $deny=$original??"Options -Indexes\nRequire all denied\n";
        $target=$public.'/.htaccess';
        if (is_link($target)) throw new RuntimeException();
        $temp=$public.'/.jange-deny-'.bin2hex(random_bytes(8));
        $handle=@fopen($temp,'xb');
        if (!$handle) throw new RuntimeException();
        try {if(fwrite($handle,$deny)!==strlen($deny) || !fflush($handle))throw new RuntimeException();}finally{fclose($handle);}
        // Original .htaccess is public-readable 0644 and contains no secret.
        if(!chmod($temp,0644) || !rename($temp,$target))throw new RuntimeException();
        $temp=null;
        if(!hash_equals(hash('sha256',$deny),hash_file('sha256',$target)))throw new RuntimeException();
        $quarantine=$root.'/closed';
        if(is_link($quarantine) || (!is_dir($quarantine) && !mkdir($quarantine,0700)) || !chmod($quarantine,0700))throw new RuntimeException();
        $entry=$public.'/api.php';$expected=$manifest['entry_sha256']??'';
        $entryRemoved=!file_exists($entry) && !is_link($entry);
        if(!$entryRemoved && is_string($expected) && preg_match('/^[a-f0-9]{64}$/D',$expected) && is_file($entry) && !is_link($entry) && hash_equals($expected,hash_file('sha256',$entry)) && !file_exists($quarantine.'/api.php')) {
            $entryRemoved=rename($entry,$quarantine.'/api.php');
            if($entryRemoved)chmod($quarantine.'/api.php',0600);
        }
        $policy=$root.'/gate.local.php';$policyRemoved=!file_exists($policy) && !is_link($policy);
        if(!$policyRemoved && is_file($policy) && !is_link($policy) && !file_exists($quarantine.'/gate.local.php')) {
            $policyRemoved=rename($policy,$quarantine.'/gate.local.php');
            if($policyRemoved)chmod($quarantine.'/gate.local.php',0600);
        }
        return ['state'=>$original!==null?'CLOSED':'EMERGENCY_DENY','original_gate_match'=>$original!==null,'entry_removed'=>$entryRemoved,'policy_removed'=>$policyRemoved];
    } catch(Throwable) {return ['state'=>'FAIL','details'=>'No private values emitted; retain deny-all and inspect scope/filesystem'];}
    finally {if(is_string($temp) && is_file($temp))@unlink($temp);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}umask($mask);}
}

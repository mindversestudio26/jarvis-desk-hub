<?php
declare(strict_types=1);
// Local drill only. No HTTP reset route or recovery secret.
if (PHP_SAPI!=='cli') exit(1);
require dirname(__DIR__).'/src/core.php';
try {
    $c=config();$db=database($c);$action=$argv[1]??'';
    if (!$c['local'] || $db->getAttribute(PDO::ATTR_DRIVER_NAME)!=='sqlite') throw new RuntimeException('Local drill only');
    if (!in_array($action,['rotate-password','recover-password'],true)) throw new RuntimeException('Unsupported action');
    $new=setting('JARVIS_NEW_PASSWORD');
    if (strlen($new)<14 || strlen($new)>72 || !preg_match('//u',$new) || str_contains($new,"\0")) throw new RuntimeException('Invalid password');
    $hash=password_hash($new,PASSWORD_BCRYPT,['cost'=>12]);
    transaction($db,function() use($db,$action,$hash) {
        $binding=workspace_binding($db);
        if (!hash_equals($binding['workspace_id'],setting('JARVIS_ADMIN_WORKSPACE'))) throw new RuntimeException('Exact workspace required');
        $owner=query($db,'SELECT pw_hash FROM owner WHERE id = ?',['owner'])->fetchColumn();
        if ($action==='rotate-password' && !password_verify(setting('JARVIS_CURRENT_PASSWORD'),$owner)) throw new RuntimeException('Current password required');
        if ($action==='recover-password' && setting('JARVIS_ADMIN_CONFIRM')!=='LOCAL-RECOVERY-REVOKE-ALL') throw new RuntimeException('Recovery confirmation required');
        query($db,'UPDATE owner SET pw_hash = ? WHERE id = ?',[$hash,'owner']);query($db,'DELETE FROM sessions');
    });
    security_event('password_changed_sessions_revoked',200);
    echo "Local password changed; all sessions revoked.\n";
} catch (Throwable) {fwrite(STDERR,"Administration failed; no credentials printed.\n");exit(1);}

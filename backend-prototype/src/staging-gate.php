<?php
declare(strict_types=1);
// Pure policy, inert until separately approved deployment. No forwarded IP trust.
function staging_gate_allows(array $policy,array $server,int $now): bool {
    $created=$policy['created']??null;$expires=$policy['expires']??null;
    if (!is_int($created) || !is_int($expires) || $expires<=$created || $expires-$created>7200 || $now<$created || $now>=$expires) return false;
    if (($server['HTTPS']??'')!=='on' || ($server['HTTP_HOST']??'')!=='jarvis-staging.glowwithimane.com') return false;
    $ips=$policy['ips']??null;
    if (!is_array($ips) || !$ips || count($ips)>4) return false;
    foreach ($ips as $ip) if (!is_string($ip) || !filter_var($ip,FILTER_VALIDATE_IP)) return false;
    if (!in_array($server['REMOTE_ADDR']??'',$ips,true)) return false;
    if (!in_array($server['REQUEST_METHOD']??'',['GET','POST'],true)) return false;
    $uri=$server['REQUEST_URI']??'';
    if (!preg_match('~^/api/v1/(?:auth/(?:login|logout)|session|sessions(?:/revoke)?|sync|memory|devices)$~D',$uri)) return false;
    $hash=$policy['token_sha256']??'';$token=$server['HTTP_X_JANGE_STAGING_TOKEN']??'';
    return is_string($hash) && is_string($token) && preg_match('/^[a-f0-9]{64}$/D',$hash) && preg_match('/^[a-f0-9]{64}$/D',$token) && hash_equals($hash,hash('sha256',$token));
}

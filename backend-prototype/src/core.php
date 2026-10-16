<?php
declare(strict_types=1);

// Single-owner prototype. No inference, device command, or shell execution path.
final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message, public array $details = []) { parent::__construct($message); }
}

function setting(string $name): string {
    $value=getenv($name);
    if ($value!==false) return $value;
    static $private=null;
    if ($private===null) {
        $private=[];
        $file=dirname(__DIR__).'/config.local.php';
        if (is_file($file)) {
            $resolved=realpath($file);
            foreach ([dirname(__DIR__).'/public',dirname(__DIR__).'/public_html',$_SERVER['DOCUMENT_ROOT']??''] as $root) {
                $root=$root!==''?realpath($root):false;
                if ($root && str_starts_with(strtolower($resolved),strtolower($root).DIRECTORY_SEPARATOR)) throw new RuntimeException('Configuration must be outside the document root');
            }
            $private=require $file;
            if (!is_array($private)) throw new RuntimeException('Invalid private configuration');
        }
    }
    $value=$private[$name]??'';
    if (!is_string($value)) throw new RuntimeException('Invalid configuration value');
    return $value;
}

function config(): array {
    $origin = setting('JARVIS_ORIGIN');
    $dsn = setting('JARVIS_DSN');
    $key = base64_decode(setting('JARVIS_DATA_KEY'), true);
    $local = setting('JARVIS_LOCAL_DEV') === '1';
    if (!extension_loaded('sodium') || !$key || strlen($key) !== 32 || !$dsn) throw new RuntimeException('Missing secure configuration');
    if (str_starts_with($dsn,'sqlite:')) {
        $directory=realpath(dirname(substr($dsn,7)));
        $webroot=realpath(dirname(__DIR__).'/public');
        if (!$directory || ($webroot && str_starts_with(strtolower($directory).DIRECTORY_SEPARATOR,strtolower($webroot).DIRECTORY_SEPARATOR))) throw new RuntimeException('SQLite must be outside the document root');
    }
    $url = parse_url($origin);
    if (!$url || !isset($url['host']) || (isset($url['user']) || isset($url['pass'])) || isset($url['query']) || isset($url['fragment']) || !empty($url['path'])) throw new RuntimeException('Invalid origin');
    if (($url['scheme'] ?? '') !== 'https' && !($local && $origin === 'http://127.0.0.1:' . ($url['port'] ?? ''))) throw new RuntimeException('HTTPS required');
    return ['origin'=>$origin, 'host'=>$url['host'].(isset($url['port'])?':'.$url['port']:''), 'dsn'=>$dsn, 'key'=>$key, 'local'=>$local,
        'cookie'=>$local?'JarvisDevSession':'__Host-JarvisSession'];
}

function database(array $c): PDO {
    if (str_starts_with($c['dsn'],'mysql:') && !preg_match('/(?:^mysql:|;)charset=utf8mb4(?:;|$)/',$c['dsn'])) throw new RuntimeException('MySQL requires explicit utf8mb4');
    $db = new PDO($c['dsn'], setting('JARVIS_DB_USER') ?: null, setting('JARVIS_DB_PASSWORD') ?: null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') { $db->exec('PRAGMA busy_timeout=5000'); $db->exec('PRAGMA foreign_keys=ON'); }
    return $db;
}
function verify_storage(PDO $db): void {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME)!=='mysql') return;
    $rows=$db->query("SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('owner','sessions','records','operations','limits')")->fetchAll();
    if (count($rows)!==5) throw new RuntimeException('Incomplete MySQL schema');
    foreach ($rows as $row) if (strtoupper($row['ENGINE'])!=='INNODB' || $row['TABLE_COLLATION']!=='utf8mb4_bin') throw new RuntimeException('InnoDB and utf8mb4_bin required');
}
function query(PDO $db, string $sql, array $params=[]): PDOStatement { $q=$db->prepare($sql); $q->execute($params); return $q; }
function transaction(PDO $db, callable $fn): mixed {
    $sqlite=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite';
    if ($sqlite) $db->exec('BEGIN IMMEDIATE'); else $db->beginTransaction();
    try {
        if (!$sqlite) query($db,'SELECT id FROM owner WHERE id = ? FOR UPDATE',['owner'])->fetch();
        $result=$fn();
        if ($sqlite) $db->exec('COMMIT'); else $db->commit();
        return $result;
    } catch (Throwable $e) { if ($sqlite) $db->exec('ROLLBACK'); else $db->rollBack(); throw $e; }
}
function encrypt_value(array $value, string $context, array $c): string {
    $nonce=random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
    return base64_encode($nonce.sodium_crypto_aead_xchacha20poly1305_ietf_encrypt(json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$context,$nonce,$c['key']));
}
function decrypt_value(string $box, string $context, array $c): array {
    $raw=base64_decode($box,true);
    if ($raw===false || strlen($raw)<40) throw new RuntimeException('Invalid encrypted record');
    $plain=sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($raw,24),$context,substr($raw,0,24),$c['key']);
    if ($plain===false) throw new RuntimeException('Record authentication failed');
    return json_decode($plain,true,16,JSON_THROW_ON_ERROR);
}
function record_context(array $r): string { return 'record:'.$r['kind'].':'.$r['id'].':'.$r['revision']; }
function public_record(array $r,array $c): array {
    return ['kind'=>$r['kind'],'id'=>$r['id'],'revision'=>(int)$r['revision'],'deleted'=>(bool)$r['deleted'],'data'=>$r['deleted']?null:decrypt_value($r['box'],record_context($r),$c)];
}
function limited(PDO $db, string $bucket, int $maximum, int $seconds): void {
    $bucket=hash('sha256',$bucket);$now=time();$row=query($db,'SELECT * FROM limits WHERE bucket = ?',[$bucket])->fetch();
    if (!$row || $now-(int)$row['started'] >= $seconds) {
        if ($row) query($db,'DELETE FROM limits WHERE bucket = ?',[$bucket]);
        query($db,'INSERT INTO limits (bucket,started,hits) VALUES (?,?,1)',[$bucket,$now]);return;
    }
    if ((int)$row['hits'] >= $maximum) throw new ApiError(429,'Request limit reached; retry later');
    query($db,'UPDATE limits SET hits = hits + 1 WHERE bucket = ?',[$bucket]);
}
function csrf(string $token,array $c): string { return hash_hmac('sha256','csrf:'.$token,$c['key']); }
function session_cookie(string $token,array $c,int $expires): void {
    setcookie($c['cookie'],$token,['expires'=>$expires,'path'=>'/','secure'=>!$c['local'],'httponly'=>true,'samesite'=>'Strict']);
}
function require_session(PDO $db,array $c,bool $write): array {
    $token=$_COOKIE[$c['cookie']]??'';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D',$token)) throw new ApiError(401,'Sign in required');
    $s=query($db,'SELECT * FROM sessions WHERE token_hash = ?',[hash('sha256',$token)])->fetch();
    if (!$s || (int)$s['expires']<=time() || time()-(int)$s['last_seen']>1800) throw new ApiError(401,'Session expired or revoked');
    if ($write && !hash_equals(csrf($token,$c),$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new ApiError(403,'Invalid CSRF token');
    transaction($db,function() use($db,$s) {
        assert_session_active($db,$s);
        limited($db,'session:'.$s['id'],600,600);
        query($db,'UPDATE sessions SET last_seen = ? WHERE id = ?',[time(),$s['id']]);
    });
    $s['csrf']=csrf($token,$c);return $s;
}
function text_field(array $data,string $key,int $max): string {
    if (!isset($data[$key]) || !is_string($data[$key]) || trim($data[$key])==='' || strlen($data[$key])>$max || !preg_match('//u',$data[$key])) throw new ApiError(422,'Invalid '.$key);
    return trim($data[$key]);
}
function validate_record(string $kind,mixed $value): array {
    if (!is_array($value) || array_is_list($value)) throw new ApiError(422,'Record must be an object');
    if ($kind==='task') {
        if (!isset($value['done']) || !is_bool($value['done'])) throw new ApiError(422,'Invalid completion state');
        return ['text'=>text_field($value,'text',720),'done'=>$value['done']];
    }
    if ($kind==='event') {
        $date=text_field($value,'date',10);$time=text_field($value,'time',5);
        $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('Asia/Dubai'));
        if (!$parsed || $parsed->format('Y-m-d')!==$date || !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/D',$time)) throw new ApiError(422,'Invalid event time/date');
        return ['text'=>text_field($value,'text',480),'date'=>$date,'time'=>$time,'timezone'=>'Asia/Dubai'];
    }
    if ($kind==='preference') {
        if (!in_array($value['language']??'', ['en-GB','ne-NP'],true)) throw new ApiError(422,'Unsupported language');
        return ['language'=>$value['language']];
    }
    if ($kind==='memory') return ['text'=>text_field($value,'text',4000)];
    throw new ApiError(422,'Unsupported record type');
}
function mutate(PDO $db,array $c,array $op,?array $session=null): array {
    $opId=text_field($op,'operation_id',36);$id=text_field($op,'id',100);$kind=$op['kind']??'';$base=$op['base_revision']??null;$deleted=$op['deleted']??false;
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$opId) || !preg_match('/^[a-z0-9_-]{1,100}$/D',$id) || !in_array($kind,['task','event','preference','memory'],true) || !is_int($base) || $base<0 || !is_bool($deleted)) throw new ApiError(422,'Invalid operation');
    $data=$deleted?[]:validate_record($kind,$op['data']??null);
    $requestHash=hash('sha256',json_encode([$id,$kind,$base,$deleted,$data],JSON_THROW_ON_ERROR));
    return transaction($db,function() use($db,$c,$opId,$id,$kind,$base,$deleted,$data,$requestHash,$session) {
        if ($session) assert_session_active($db,$session);
        $seen=query($db,'SELECT * FROM operations WHERE id = ?',[$opId])->fetch();
        if ($seen) {
            if (!hash_equals($seen['request_hash'],$requestHash)) throw new ApiError(409,'Operation ID already used');
            $current=query($db,'SELECT * FROM records WHERE kind = ? AND id = ?',[$kind,$id])->fetch();
            if (!$current) throw new RuntimeException('Retry history without record');
            return ['record'=>public_record($current,$c)];
        }
        $old=query($db,'SELECT * FROM records WHERE kind = ? AND id = ?',[$kind,$id])->fetch();
        if (($old?(int)$old['revision']:0)!==$base) throw new ApiError(409,'Record changed on another device',['current'=>$old?public_record($old,$c):null]);
        if (!$old && (int)query($db,'SELECT COUNT(*) FROM records')->fetchColumn()>=1000) throw new ApiError(429,'Record storage limit reached');
        if ((int)query($db,'SELECT COUNT(*) FROM operations')->fetchColumn()>=10000) throw new ApiError(429,'Operation history limit reached; maintenance required');
        $size=strlen(json_encode($data,JSON_THROW_ON_ERROR));
        $used=(int)query($db,'SELECT COALESCE(SUM(size),0) FROM records')->fetchColumn();
        if ($used-($old?(int)$old['size']:0)+$size>5242880) throw new ApiError(429,'Storage limit reached');
        query($db,'UPDATE owner SET revision = revision + 1 WHERE id = ?',['owner']);
        $revision=(int)query($db,'SELECT revision FROM owner WHERE id = ?',['owner'])->fetchColumn();
        $record=['kind'=>$kind,'id'=>$id,'revision'=>$revision,'deleted'=>$deleted];
        $box=encrypt_value($data,record_context($record),$c);
        if ($old) query($db,'UPDATE records SET revision=?, deleted=?, box=?, size=?, updated=? WHERE kind=? AND id=?',[$revision,(int)$deleted,$box,$size,time(),$kind,$id]);
        else query($db,'INSERT INTO records (kind,id,revision,deleted,box,size,updated) VALUES (?,?,?,?,?,?,?)',[$kind,$id,$revision,(int)$deleted,$box,$size,time()]);
        $result=['record'=>$record+['data'=>$deleted?null:$data]];
        query($db,'INSERT INTO operations (id,request_hash,box,created) VALUES (?,?,?,?)',[$opId,$requestHash,encrypt_value($result,'operation:'.$opId,$c),time()]);
        return $result;
    });
}

// Call under the same owner lock used by writes and revocation.
function assert_session_active(PDO $db,array $session): void {
    $fresh=query($db,'SELECT * FROM sessions WHERE id = ? AND token_hash = ?',[$session['id'],$session['token_hash']])->fetch();
    if (!$fresh || (int)$fresh['expires']<=time() || time()-(int)$fresh['last_seen']>1800) throw new ApiError(401,'Session expired or revoked');
}
function revoke_session(PDO $db,array $actor,string $target): void {
    transaction($db,function() use($db,$actor,$target) {
        assert_session_active($db,$actor);
        query($db,'DELETE FROM sessions WHERE id = ?',[$target]);
    });
}
function snapshot(PDO $db,array $c,array $session,bool $memory): array {
    return transaction($db,function() use($db,$c,$session,$memory) {
        assert_session_active($db,$session);
        $rows=query($db,$memory?'SELECT * FROM records WHERE kind = ? ORDER BY revision':'SELECT * FROM records WHERE kind <> ? ORDER BY revision',['memory'])->fetchAll();
        return ['revision'=>(int)query($db,'SELECT revision FROM owner WHERE id = ?',['owner'])->fetchColumn(),'records'=>array_map(fn($r)=>public_record($r,$c),$rows)];
    });
}
function security_event(string $event,int $status): void {
    // Fixed event names/status only: never include credentials, body, IP or exceptions.
    error_log(json_encode(['component'=>'jarvis-api','event'=>$event,'status'=>$status,'time'=>gmdate('c')],JSON_THROW_ON_ERROR));
}

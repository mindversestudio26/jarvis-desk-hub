<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') exit(1);
require dirname(__DIR__).'/src/core.php';
$c=config();$db=database($c);
$password=getenv('JARVIS_INITIAL_PASSWORD')?:'';
if (strlen($password)<14 || strlen($password)>72) throw new RuntimeException('Initial password must have 14–72 UTF-8 bytes');
$username=getenv('JARVIS_OWNER_NAME')?:'owner';
if (!preg_match('/^[A-Za-z0-9_-]{1,80}$/D',$username)) throw new RuntimeException('Invalid account name');
$db->exec(file_get_contents(dirname(__DIR__).'/schema.sql'));
if ((int)query($db,'SELECT COUNT(*) FROM owner')->fetchColumn()!==0) throw new RuntimeException('Owner already exists; refusing to overwrite');
query($db,'INSERT INTO owner (id,username,pw_hash,revision) VALUES (?,?,?,0)',['owner',$username,password_hash($password,PASSWORD_BCRYPT,['cost'=>12])]);
echo "Initialized one owner. No credentials printed.\n";

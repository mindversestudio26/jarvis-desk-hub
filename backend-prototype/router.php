<?php
declare(strict_types=1);
// Local development router only. Point a production document root at public/.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if (str_starts_with($path,'/api/')) {require __DIR__.'/public/api.php';return true;}
$root=realpath(__DIR__.'/public');$file=realpath($root.($path==='/'?'/index.html':$path));
if (!$file || !str_starts_with($file,$root.DIRECTORY_SEPARATOR) || !is_file($file)) {http_response_code(404);return true;}
return false;

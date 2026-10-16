<?php
declare(strict_types=1);
// CLI only; no web endpoint or shell execution. Never schedules itself.
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
require dirname(__DIR__).'/src/staging-shutdown.php';
$report=staging_shutdown(dirname(__DIR__),time());
echo json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
exit(in_array($report['state'],['ARMED','CLOSED'],true)?0:1);

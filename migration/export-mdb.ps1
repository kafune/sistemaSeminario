# Exporta todas as tabelas do stg.mdb (Access 97) para CSV UTF-8.
# Requer o provedor Microsoft.Jet.OLEDB.4.0, que so existe em processo 32-bit:
# se estiver rodando em PowerShell 64-bit, relanca a si mesmo no PowerShell de 32-bit.
#
# Uso:  powershell -File export-mdb.ps1 [-MdbPath C:\stg\stg.mdb] [-OutDir .\csv]

param(
    [string]$MdbPath = "C:\stg\stg.mdb",
    [string]$OutDir  = (Join-Path $PSScriptRoot "csv")
)

if ([Environment]::Is64BitProcess) {
    $ps32 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
    if (-not (Test-Path $ps32)) { throw "PowerShell 32-bit nao encontrado em $ps32" }
    & $ps32 -NoProfile -File $PSCommandPath -MdbPath $MdbPath -OutDir $OutDir
    exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null

$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$MdbPath;Mode=Read")

# Lista de tabelas de usuario (ignora tabelas de sistema MSys*)
$tables = @()
$rs = $conn.OpenSchema(20)  # adSchemaTables
while (-not $rs.EOF) {
    if ($rs.Fields.Item("TABLE_TYPE").Value -eq "TABLE") {
        $tables += $rs.Fields.Item("TABLE_NAME").Value
    }
    $rs.MoveNext()
}
$rs.Close()

# Dump do schema (tabela|coluna|tipo ADO|posicao) para uso do import
$schemaOut = New-Object System.IO.StreamWriter((Join-Path $OutDir "_schema.csv"), $false, (New-Object System.Text.UTF8Encoding($false)))
$schemaOut.WriteLine("table|column|adotype|ordinal")
$rs = $conn.OpenSchema(4)  # adSchemaColumns
$schemaRows = @()
while (-not $rs.EOF) {
    $t = $rs.Fields.Item("TABLE_NAME").Value
    if ($t -notlike "MSys*") {
        $schemaRows += [PSCustomObject]@{
            T = $t
            C = $rs.Fields.Item("COLUMN_NAME").Value
            Y = $rs.Fields.Item("DATA_TYPE").Value
            O = $rs.Fields.Item("ORDINAL_POSITION").Value
        }
    }
    $rs.MoveNext()
}
$rs.Close()
$schemaRows | Sort-Object T, O | ForEach-Object { $schemaOut.WriteLine("$($_.T)|$($_.C)|$($_.Y)|$($_.O)") }
$schemaOut.Close()

function Csv-Escape([object]$v) {
    if ($null -eq $v -or $v -is [System.DBNull]) { return "" }
    if ($v -is [datetime]) { return '"' + $v.ToString("yyyy-MM-dd HH:mm:ss") + '"' }
    $s = [string]$v
    return '"' + $s.Replace('"', '""') + '"'
}

foreach ($t in $tables) {
    $path = Join-Path $OutDir ($t + ".csv")
    $w = New-Object System.IO.StreamWriter($path, $false, (New-Object System.Text.UTF8Encoding($false)))
    $rs = $conn.Execute("SELECT * FROM [$t]")
    $nf = $rs.Fields.Count
    $hdr = @()
    for ($i = 0; $i -lt $nf; $i++) { $hdr += $rs.Fields.Item($i).Name }
    $w.WriteLine(($hdr -join ","))
    $n = 0
    while (-not $rs.EOF) {
        $vals = @()
        for ($i = 0; $i -lt $nf; $i++) { $vals += (Csv-Escape $rs.Fields.Item($i).Value) }
        $w.WriteLine(($vals -join ","))
        $rs.MoveNext()
        $n++
    }
    $rs.Close()
    $w.Close()
    Write-Output ("{0}: {1} registros" -f $t, $n)
}

$conn.Close()
Write-Output "Exportacao concluida em $OutDir"

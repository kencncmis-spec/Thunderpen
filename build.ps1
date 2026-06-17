# build.ps1 — 將外掛打包為 tinymce-composer.xpi
# 執行：在 tb_editer\ 資料夾內執行  .\build.ps1

$ErrorActionPreference = 'Stop'
$outFile = Join-Path $PSScriptRoot 'tinymce-composer.xpi'

# 確認 TinyMCE 已放置
$tinymceJs = Join-Path $PSScriptRoot 'tinymce\tinymce.min.js'
if (-not (Test-Path $tinymceJs)) {
    Write-Error "找不到 tinymce\tinymce.min.js，請先依 README.md 說明放置 TinyMCE 檔案。"
    exit 1
}

# 刪除舊的 .xpi
if (Test-Path $outFile) { Remove-Item $outFile -Force }

# 要打包的項目（排除開發用檔案）
$include = @(
    'manifest.json',
    'background.js',
    'compose',
    'tinymce',
    'icons'
)

# 使用 .NET ZipFile 建立壓縮檔
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($outFile, 'Create')

foreach ($item in $include) {
    $fullPath = Join-Path $PSScriptRoot $item
    if (Test-Path $fullPath -PathType Leaf) {
        $entryName = $item.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $entryName) | Out-Null
    } elseif (Test-Path $fullPath -PathType Container) {
        Get-ChildItem $fullPath -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($PSScriptRoot.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relative) | Out-Null
        }
    }
}

$zip.Dispose()

$size = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
Write-Host "✅ 打包完成：tinymce-composer.xpi ($size KB)" -ForegroundColor Green
Write-Host "   安裝方式：Thunderbird → 工具 → 外掛程式 → 從檔案安裝"

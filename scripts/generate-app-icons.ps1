$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'assets/branding/app-icon.png'))

function Export-Icon([string]$relativePath, [int]$size, [switch]$Round) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $mask = [System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        if ($Round) {
            $mask.AddEllipse(0, 0, $size, $size)
            $graphics.SetClip($mask)
        }
        $graphics.DrawImage($source, 0, 0, $size, $size)
        $bitmap.Save((Join-Path $projectRoot $relativePath), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $mask.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    New-Item -ItemType Directory -Force (Join-Path $projectRoot 'public') | Out-Null
    Export-Icon 'public/favicon.png' 48
    Export-Icon 'public/apple-touch-icon.png' 180
    foreach ($entry in @(@('mdpi', 48, 108), @('hdpi', 72, 162), @('xhdpi', 96, 216), @('xxhdpi', 144, 324), @('xxxhdpi', 192, 432))) {
        $directory = "android/app/src/main/res/mipmap-$($entry[0])"
        Export-Icon "$directory/ic_launcher.png" $entry[1]
        Export-Icon "$directory/ic_launcher_round.png" $entry[1] -Round
        Export-Icon "$directory/ic_launcher_foreground.png" $entry[2]
    }
} finally {
    $source.Dispose()
}

# Draws the OzBox app icon (a glassy rounded square etched with "OZ") as a 1024px PNG.
# Regenerate all icon sizes afterwards with:  npx tauri icon src-tauri/icons/source.png
param([string]$Out = "$PSScriptRoot\..\src-tauri\icons\source.png")

Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

$inset = 64
$body = New-RoundedRect $inset $inset ($size - 2 * $inset) ($size - 2 * $inset) 210
$bounds = New-Object System.Drawing.RectangleF $inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset)

# Tinted glass base: deep blue to violet.
$base = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bounds,
  ([System.Drawing.Color]::FromArgb(255, 58, 88, 160)),
  ([System.Drawing.Color]::FromArgb(255, 34, 40, 84)), 60
$g.FillPath($base, $body)

# Soft light pooling top-left.
$g.SetClip($body)
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(-180, -260, 1000, 760)
$glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
$glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(120, 255, 255, 255)
$glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
$g.FillPath($glowBrush, $glow)
$g.ResetClip()

# Bevelled rim: bright edge plus a faint inner line.
$rim = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bounds,
  ([System.Drawing.Color]::FromArgb(230, 255, 255, 255)),
  ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), 60
$g.DrawPath((New-Object System.Drawing.Pen $rim, 14), $body)
$inner = New-RoundedRect ($inset + 22) ($inset + 22) ($size - 2 * $inset - 44) ($size - 2 * $inset - 44) 190
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 255, 255, 255)), 6), $inner)

# "OZ": a soft shadow, then bright lettering.
$font = New-Object System.Drawing.Font "Segoe UI Semibold", 400, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$textRect = New-Object System.Drawing.RectangleF 0, 20, $size, $size
$shadowRect = New-Object System.Drawing.RectangleF 0, 34, $size, $size
$g.DrawString("OZ", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 30))), $shadowRect, $fmt)
$g.DrawString("OZ", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 255, 255, 255))), $textRect, $fmt)

$bmp.Save((Resolve-Path -LiteralPath (Split-Path $Out)).Path + "\" + (Split-Path $Out -Leaf), [System.Drawing.Imaging.ImageFormat]::Png)
"wrote $Out"

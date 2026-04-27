param(
  [string]$Subject = "CN=RelyyConvert Dev Code Signing",
  [string]$OutputPath = "certs\RelyyConvert-dev-codesign.pfx"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
foreach ($envFileName in @(".env.installer.local", "env.installer.local")) {
  $envFile = Join-Path $root $envFileName
  if (!(Test-Path -LiteralPath $envFile)) {
    continue
  }

  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) {
      return
    }

    $index = $line.IndexOf("=")
    if ($index -le 0) {
      return
    }

    $key = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key, "Process"))) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERT_PASSWORD)) {
  throw "WINDOWS_CERT_PASSWORD is not set. Set it before running this script."
}

if ($OutputPath -eq "certs\RelyyConvert-dev-codesign.pfx" -and ![string]::IsNullOrWhiteSpace($env:WINDOWS_SIGN_CERT_FILE)) {
  $OutputPath = $env:WINDOWS_SIGN_CERT_FILE
}

$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $root $OutputPath
}

$outputDir = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path -LiteralPath $resolvedOutput) {
  Remove-Item -LiteralPath $resolvedOutput -Force
}

$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  $Subject,
  $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)

$eku = [System.Security.Cryptography.OidCollection]::new()
[void]$eku.Add([System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.3", "Code Signing"))
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku, $false)
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,
    $true
  )
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
)
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false)
)

$cert = $request.CreateSelfSigned((Get-Date).AddDays(-1), (Get-Date).AddYears(3))
$pfxBytes = $cert.Export(
  [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
  $env:WINDOWS_CERT_PASSWORD
)
[System.IO.File]::WriteAllBytes($resolvedOutput, $pfxBytes)

Write-Host "Created self-signed code-signing certificate:"
Write-Host "  Subject: $Subject"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  PFX: $resolvedOutput"
Write-Host ""
Write-Host "Use it for signing in this PowerShell session:"
Write-Host "`$env:WINDOWS_CERT_PATH=`"$resolvedOutput`""
Write-Host "`$env:WINDOWS_SIGN_CERT_FILE=`"$resolvedOutput`""
Write-Host "`$env:WINDOWS_CERT_SUBJECT=`"$Subject`""
Write-Host ""
Write-Host "For PFX signing, keep WINDOWS_CERT_PASSWORD set and run:"
Write-Host "  npm run app:sign"
Write-Host ""
Write-Host "Note: this is a self-signed certificate. Windows will not treat it like a public CA-backed production code-signing certificate."

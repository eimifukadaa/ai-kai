param(
    [string]$PdfPath,
    [int]$PageNumber,
    [string]$OutputPath
)

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
    [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
    
    $file = Get-Item $PdfPath
    $asyncOpFile = [Windows.Storage.StorageFile]::GetFileFromPathAsync($file.FullName)
    while ($asyncOpFile.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $storageFile = $asyncOpFile.GetResults()

    $asyncOperation = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)
    
    while ($asyncOperation.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $pdfDoc = $asyncOperation.GetResults()
    
    if ($PageNumber -gt $pdfDoc.PageCount) {
        Write-Error "Page number out of range"
        exit 1
    }
    
    $page = $pdfDoc.GetPage($PageNumber - 1)
    
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
    # High resolution for OCR
    $options.DestinationWidth = $page.Size.Width * 2
    
    $asyncAction = $page.RenderToStreamAsync($stream, $options)
    while ($asyncAction.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $asyncAction.GetResults()
    
    $fileStream = [System.IO.FileStream]::new($OutputPath, [System.IO.FileMode]::Create)
    $stream.Seek(0)
    $buffer = New-Object byte[] 1024
    while ($true) {
        $read = $stream.ReadAsync($buffer, 0, 1024, [System.Threading.CancellationToken]::None).Result
        if ($read -eq 0) { break }
        $fileStream.Write($buffer, 0, $read)
    }
    $fileStream.Close()
    $stream.Close()
    
    Write-Host "Success: Rendered page $PageNumber to $OutputPath"
} catch {
    Write-Error "Error rendering PDF: $_"
    exit 1
}

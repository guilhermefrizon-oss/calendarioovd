param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Drawing
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.IgnoreWriteExceptions = $true
try { $listener.Start() } catch [System.Net.HttpListenerException] { exit 0 }
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(60)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('Vonder-Local-Post-Editor/1.0')
$client.DefaultRequestHeaders.Accept.ParseAdd('image/png')
$client.DefaultRequestHeaders.Accept.ParseAdd('image/jpeg')
$client.DefaultRequestHeaders.Accept.ParseAdd('image/webp')
function Send-TextResponse($response,[int]$status,[string]$message){$bytes=[System.Text.Encoding]::UTF8.GetBytes($message);$response.StatusCode=$status;$response.ContentType='text/plain; charset=utf-8';$response.ContentLength64=$bytes.Length;$response.OutputStream.Write($bytes,0,$bytes.Length)}
while($listener.IsListening){
 $context=$null
 try{
  $context=$listener.GetContext();$request=$context.Request;$response=$context.Response
  $response.Headers['Access-Control-Allow-Origin']='*';$response.Headers['Access-Control-Allow-Methods']='GET, OPTIONS';$response.Headers['Access-Control-Allow-Headers']='Content-Type';$response.Headers['X-Content-Type-Options']='nosniff'
  if($request.HttpMethod-eq'OPTIONS'){$response.StatusCode=204;$response.Close();continue}
  if($request.Url.AbsolutePath-eq'/health'){Send-TextResponse $response 200 'ok';$response.Close();continue}
  if($request.Url.AbsolutePath-ne'/product-image'){Send-TextResponse $response 404 'Rota não encontrada.';$response.Close();continue}
  $code=[regex]::Replace([string]$request.QueryString['code'],'\D','')
  if($code.Length-lt 5-or $code.Length-gt 20){Send-TextResponse $response 400 'Código de produto inválido.';$response.Close();continue}
  $width=0;[int]::TryParse([string]$request.QueryString['w'],[ref]$width)|Out-Null
  if($width-gt 0){$width=[Math]::Max(32,[Math]::Min(2000,$width))}
  $upstreamUrl='https://app.ovd.com.br/fotos/produto?codigo='+[uri]::EscapeDataString($code)
  $upstream=$client.GetAsync($upstreamUrl,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  if(-not $upstream.IsSuccessStatusCode){$upstream.Dispose();Send-TextResponse $response 404 'Imagem do produto não encontrada.';$response.Close();continue}
  $stream=$upstream.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$head=New-Object byte[] 12;$headLength=0
  while($headLength-lt $head.Length){$read=$stream.Read($head,$headLength,$head.Length-$headLength);if($read-le 0){break};$headLength+=$read}
  $mime=''
  if($headLength-ge 3-and $head[0]-eq 0xFF-and $head[1]-eq 0xD8-and $head[2]-eq 0xFF){$mime='image/jpeg'}
  elseif($headLength-ge 8-and $head[0]-eq 0x89-and $head[1]-eq 0x50-and $head[2]-eq 0x4E-and $head[3]-eq 0x47){$mime='image/png'}
  elseif($headLength-ge 12-and [System.Text.Encoding]::ASCII.GetString($head,0,4)-eq'RIFF'-and [System.Text.Encoding]::ASCII.GetString($head,8,4)-eq'WEBP'){$mime='image/webp'}
  if(-not $mime){$stream.Dispose();$upstream.Dispose();Send-TextResponse $response 415 'Formato de imagem não reconhecido.';$response.Close();continue}
  $response.Headers['Cache-Control']='public, max-age=604800'
  if($width-gt 0){
   $buffer=New-Object System.IO.MemoryStream;$buffer.Write($head,0,$headLength);$stream.CopyTo($buffer);$stream.Dispose();$upstream.Dispose()
   $thumbBytes=$null
   try{
    $buffer.Position=0;$srcImage=[System.Drawing.Image]::FromStream($buffer)
    $longSide=[Math]::Max($srcImage.Width,$srcImage.Height)
    if($longSide-gt $width){
     $scale=$width/$longSide;$dstW=[Math]::Max(1,[int][Math]::Round($srcImage.Width*$scale));$dstH=[Math]::Max(1,[int][Math]::Round($srcImage.Height*$scale))
     $dstImage=New-Object System.Drawing.Bitmap($dstW,$dstH,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
     $g=[System.Drawing.Graphics]::FromImage($dstImage);$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality;$g.DrawImage($srcImage,0,0,$dstW,$dstH);$g.Dispose()
     $outStream=New-Object System.IO.MemoryStream
     $format=if($mime-eq'image/png'){[System.Drawing.Imaging.ImageFormat]::Png}elseif($mime-eq'image/jpeg'){[System.Drawing.Imaging.ImageFormat]::Jpeg}else{[System.Drawing.Imaging.ImageFormat]::Png}
     $dstImage.Save($outStream,$format);$thumbBytes=$outStream.ToArray();if($mime-eq'image/webp'){$mime='image/png'}
     $dstImage.Dispose();$outStream.Dispose()
    }
    $srcImage.Dispose()
   }catch{}
   $response.StatusCode=200;$response.ContentType=$mime
   if($null-ne $thumbBytes){$response.ContentLength64=$thumbBytes.Length;$response.OutputStream.Write($thumbBytes,0,$thumbBytes.Length)}
   else{$bytes=$buffer.ToArray();$response.ContentLength64=$bytes.Length;$response.OutputStream.Write($bytes,0,$bytes.Length)}
   $buffer.Dispose();$response.Close()
  }else{
   $response.StatusCode=200;$response.ContentType=$mime;$length=$upstream.Content.Headers.ContentLength
   if($null-ne $length-and $length-gt 0){$response.ContentLength64=[long]$length}else{$response.SendChunked=$true}
   $response.OutputStream.Write($head,0,$headLength);$stream.CopyTo($response.OutputStream);$stream.Dispose();$upstream.Dispose();$response.Close()
  }
 }catch{if($null-ne $context){try{Send-TextResponse $context.Response 502 'Não foi possível carregar a imagem do produto.';$context.Response.Close()}catch{}}}
}
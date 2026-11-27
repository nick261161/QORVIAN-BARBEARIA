export async function clientImageCompress(file:File,profile:'catalog'|'avatar'|'banner'){
  const {default:compress}=await import('browser-image-compression');
  const banner=profile==='banner';
  const image=await compress(file,{maxWidthOrHeight:banner?1920:800,fileType:'image/webp',initialQuality:banner?.82:.80,
    maxSizeMB:(banner?350:150)/1024,useWebWorker:true,preserveExif:false});
  if(image.type!=='image/webp')throw new Error('O navegador não conseguiu converter a imagem para WebP.');
  return new File([image],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
}

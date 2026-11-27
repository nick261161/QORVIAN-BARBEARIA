export async function clientImageCompress(file:File,profile:'catalog'|'avatar'|'banner'){
  const {default:compress}=await import('browser-image-compression');
  const banner=profile==='banner';
  const options={maxWidthOrHeight:banner?1920:800,initialQuality:banner?.82:.80,maxSizeMB:(banner?350:150)/1024,preserveExif:false};
  const name=file.name.replace(/\.[^.]+$/,'');
  try{
    const image=await compress(file,{...options,fileType:'image/webp',useWebWorker:true});
    if(image.type==='image/webp')return new File([image],name+'.webp',{type:'image/webp'});
  }catch{/* Some mobile browsers cannot encode WebP in a worker. */}
  try{
    const jpeg=await compress(file,{...options,fileType:'image/jpeg',useWebWorker:false});
    if(jpeg.type==='image/jpeg')return new File([jpeg],name+'.jpg',{type:'image/jpeg'});
  }catch{/* Supported originals can be processed by Sharp. */}
  if(file.size<=4*1024*1024&&['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))return file;
  throw new Error('Não foi possível reduzir esta imagem. Escolha uma foto JPEG, PNG ou WebP menor.');
}

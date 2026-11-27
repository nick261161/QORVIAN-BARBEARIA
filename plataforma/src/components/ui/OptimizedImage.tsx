'use client';
import Image from 'next/image';
import {useState} from 'react';

const placeholder='/image-placeholder.webp';
type Props={src?:string;alt:string;className?:string;loading?:'lazy';fetchPriority?:'high'|'low'|'auto'};
export function OptimizedImage({src,alt,className,fetchPriority}:Props){
  const [failed,setFailed]=useState<string>();
  const candidate=src&&/^(?:https:\/\/|\/(?!\/)[a-z0-9_-])/i.test(src)?src:placeholder;
  return <Image src={failed===candidate?placeholder:candidate} alt={alt} className={className} width={800} height={800}
    loading="lazy" unoptimized fetchPriority={fetchPriority} onError={()=>setFailed(candidate)}/>;
}

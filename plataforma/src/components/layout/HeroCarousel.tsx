'use client';
import type {ReactNode} from 'react';
import {FullBleedHero} from './FullBleedHero';

export function HeroCarousel({photos,children}:{photos:string[];children:ReactNode}){
  return <FullBleedHero photos={photos} automatic>{children}</FullBleedHero>;
}

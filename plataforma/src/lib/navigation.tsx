'use client';
import NextLink from 'next/link';
import {useParams as nextParams,usePathname,useRouter,useSearchParams as nextSearchParams} from 'next/navigation';
import {useEffect,type ComponentProps} from 'react';

type LinkProps=Omit<ComponentProps<typeof NextLink>,'href'> & {to:string};
export function Link({to,...props}:LinkProps){return <NextLink href={to} {...props}/>;}
export function NavLink({to,end,className,...props}:LinkProps&{end?:boolean}){
  const path=usePathname();
  const active=path===to||(!end&&path.startsWith(to+'/'));
  return <NextLink href={to} className={[className,active?'active':''].filter(Boolean).join(' ')} aria-current={active?'page':undefined} {...props}/>;
}
export function useParams(){return nextParams<Record<string,string|string[]>>();}
export function useSearchParams(){return [nextSearchParams()] as const;}
export function useNavigate(){
  const router=useRouter();
  return (to:string,options?:{replace?:boolean})=>options?.replace?router.replace(to):router.push(to);
}
export function Navigate({to,replace=false}:{to:string;replace?:boolean}){
  const router=useRouter();
  useEffect(()=>{if(replace)router.replace(to);else router.push(to);},[router,to,replace]);
  return null;
}

import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const photos=process.env.S3_PUBLIC_URL?new URL(process.env.S3_PUBLIC_URL):null;
export default {
  poweredByHeader:false,
  outputFileTracingRoot:root,
  devIndicators:false,
  serverExternalPackages:['googleapis'],
  images:{unoptimized:true,remotePatterns:photos?[{protocol:'https',hostname:photos.hostname}]:[]},
  async headers(){
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    ]}];
  },
  webpack(config){
    config.resolve.extensionAlias={...config.resolve.extensionAlias,'.js':['.js','.ts','.tsx']};
    return config;
  },
};

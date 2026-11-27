import {serve} from '@/lib/api-handler';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export {serve as GET,serve as POST,serve as PUT,serve as PATCH,serve as DELETE};

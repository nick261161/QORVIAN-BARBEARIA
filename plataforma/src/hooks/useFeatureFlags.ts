import type { Feature,Flags } from '../../shared/features.js';
export function useFeatureFlags(flags?:Flags){return (flag:Feature)=>flags?.[flag]===true;}

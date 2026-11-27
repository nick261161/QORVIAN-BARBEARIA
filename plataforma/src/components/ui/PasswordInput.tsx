'use client';
import {useState,type ComponentProps} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export function PasswordInput(props:Omit<ComponentProps<'input'>,'type'>){
  const [shown,show]=useState(false);
  const Icon=shown?EyeOff:Eye;
  return <span className="campo-senha">
    <input {...props} type={shown?'text':'password'} spellCheck={false} autoCapitalize="none"/>
    <button type="button" tabIndex={-1} aria-label={shown?'Ocultar senha':'Mostrar senha'} aria-pressed={shown} onClick={()=>show(!shown)}>
      <Icon size={19} aria-hidden="true"/>
    </button>
  </span>;
}

'use client';
import {useId,useState} from 'react';
import {Plus} from 'lucide-react';
import {api,type CatalogCategory} from '@/services/api';
import {Result,useAction} from '@/components/ui';

export function CategorySelectField({type,categories,initial,refresh}:{type:CatalogCategory['type'];categories:CatalogCategory[];initial?:string|null;refresh:()=>void}){
  const id=useId();
  const [value,setValue]=useState(initial??'');
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [created,setCreated]=useState<CatalogCategory>();
  const action=useAction(refresh);
  const available=categories.filter(item=>item.is_active);
  if(created&&!available.some(item=>item.id===created.id))available.push(created);
  function create(){
    if(name.trim().length<2)return;
    void action.perform(async()=>{
      const added=await api<CatalogCategory>('/categories',{method:'POST',body:{type,name:name.trim()}});
      setCreated(added);setValue(added.id);setName('');setOpen(false);
    });
  }
  return <div className="campo-categoria">
    <div className="acoes"><label htmlFor={id}>Categoria</label>
      <button type="button" className="botao secundario" aria-expanded={open} onClick={()=>setOpen(!open)}><Plus size={15}/> Nova categoria</button></div>
    <select name="category_id" id={id} required value={value} onChange={event=>setValue(event.target.value)}>
      <option value="">Selecione uma categoria</option>
      {available.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {open&&<div className="formulario"><label>Nome da nova categoria<input value={name} maxLength={100} onChange={event=>setName(event.target.value)}
      onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();create();}}}/></label>
      <button type="button" className="botao primario" disabled={action.pending||name.trim().length<2} onClick={create}>Criar categoria</button>
    </div>}
    <Result error={action.error} success={action.success}/>
  </div>;
}

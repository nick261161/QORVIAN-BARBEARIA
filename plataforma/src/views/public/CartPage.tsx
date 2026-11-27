'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useRef,useState,type FormEvent } from 'react';
import { Package,ShoppingBag } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { api,currency,type Order } from '../../services/api.js';
import { useCart } from '../../contexts/CartContext.js';
import { AccessForm,useSession } from '../../contexts/AuthContext.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { Notice,Result,useAction } from '../../components/ui/index.js';

export function CartPage(){
  const {tenant,flags,refresh}=useStore();const cart=useCart()!;
  const {session}=useSession();const action=useAction();const [modality,setModality]=useState('RETIRADA_NO_LOCAL');const [order,setOrder]=useState<Order>();
  const pendingRequest=useRef<{body:string;key:string}|null>(null);
  const authorized=session?.role==='CLIENT'&&session.slug===tenant.slug;
  const available=cart.lines.every(line=>line.quantity<=(line.product.stock_quantity??0));
  const root=`/loja/${tenant.slug}`;
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!authorized||!available)return;
    const form=new FormData(event.currentTarget);
    void action.perform(async()=>{
      const body={modality,delivery_address:form.get('delivery_address')??'',items:cart.lines.map(line=>({product_id:line.product.id,quantity:line.quantity}))};
      const signature=JSON.stringify(body);
      if(pendingRequest.current?.body!==signature)pendingRequest.current={body:signature,key:crypto.randomUUID()};
      const result=await api<Order>(`/client/${tenant.slug}/orders`,{method:'POST',body:{...body,request_key:pendingRequest.current.key}});
      setOrder(result);cart.clear();refresh();
    },'Pedido registrado.').then(ok=>{if(!ok)refresh();});
  }
  if(!flags.enable_shopping_cart||!flags.enable_products_store)return <main className="largura pagina"><Notice empty="Pedidos online indisponíveis."/></main>;
  return <><main className="largura pagina"><h1>Carrinho</h1>
    {order?<section className="painel formulario"><h2>Pedido recebido</h2><p>Total {currency(order.total_cents)}. Seu pedido aguarda conclusão pelo estabelecimento.</p><div className="acoes"><Link className="botao primario" to={`${root}/conta`}>Ver meus pedidos</Link></div></section>:
    !cart.lines.length?<section className="painel formulario"><p>Seu carrinho está vazio.</p><div className="acoes"><Link className="botao primario" to={`${root}/produtos`}>Explorar produtos</Link></div></section>:
    <div className="reserva-grid"><section className="painel"><h2>Produtos selecionados</h2><ul className="linhas">{cart.lines.map(({product,quantity})=><li className="linha-dados" key={product.id}>
      {product.photo?<OptimizedImage className="avatar" src={product.photo} alt=""/>:<span className="icone-suave"><Package size={18}/></span>}
      <div className="corpo-linha"><strong>{product.name}</strong><p>{currency(product.price_cents)} por unidade · {product.stock_quantity??0} em estoque</p></div>
      <div className="acoes"><button className="botao secundario quadrado" aria-label={`Diminuir ${product.name}`} onClick={()=>cart.set(product.id,quantity-1)}>−</button><span>{quantity}</span>
        <button className="botao secundario quadrado" aria-label={`Aumentar ${product.name}`} disabled={quantity>=Math.min(product.stock_quantity??0,100)} onClick={()=>cart.set(product.id,quantity+1)}>+</button>
        <button className="botao secundario" onClick={()=>cart.set(product.id,0)}>Remover</button></div>
    </li>)}</ul>{!available&&<Notice error="O estoque mudou. Ajuste as quantidades para continuar."/>}<Link className="voltar" to={`${root}/produtos`}>Continuar comprando</Link></section>
    <section className="painel formulario"><span className="icone-suave"><ShoppingBag size={20}/></span><h2>Finalizar pedido</h2><div className="reserva-total"><span>Total</span><strong>{currency(cart.total)}</strong></div>
      {!authorized?<><p>Entre na sua conta de cliente para continuar.</p><AccessForm slug={tenant.slug} allowRegistration onSuccess={()=>{}}/></>:
      <form className="formulario" onSubmit={submit}><label>Recebimento<select value={modality} onChange={event=>setModality(event.target.value)}><option value="RETIRADA_NO_LOCAL">Retirada no local</option><option value="ENTREGA">Entrega</option></select></label>
        {modality==='ENTREGA'&&<label>Endereço para entrega<textarea name="delivery_address" required minLength={5} maxLength={500}/></label>}
        <p className="suave">Combine o pagamento com o estabelecimento.</p><button className="botao primario" disabled={action.pending||!available}>Registrar pedido</button>
      </form>}<Result error={action.error} success={action.success}/></section></div>}
  </main></>;
}

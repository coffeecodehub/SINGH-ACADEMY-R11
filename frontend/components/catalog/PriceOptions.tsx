import Link from 'next/link';
import {catalogOffers,catalogCheckout,accessTerm} from '../../lib/catalogPresentation';
import {money} from '../../lib/money';
import './catalog.css';

/** Prices are totals supplied by the authenticated catalog, never browser country calculations. */
export default function PriceOptions({product,kind,checkout=false}:{product:any;kind:'course'|'section'|'membership';checkout?:boolean}){
 const offers=catalogOffers(product);
 if(!offers.length)return null;
 return <div className="catalogPrices"><ul aria-label="Access duration and total price">{offers.map(offer=><li key={offer.key}><div><b>{money(offer.price,offer.currency)}</b><span>total for {accessTerm(offer.durationMonths)}</span>{offer.label&&<small>{offer.label}</small>}</div>{checkout&&<Link prefetch={false} className="pill" href={catalogCheckout(kind,kind==='membership'?product.name:product.slug,offer.key)}>Choose {accessTerm(offer.durationMonths)}</Link>}</li>)}</ul><small className="catalogPriceNote">USD total for the selected access period. Your account country determines available prices; checkout confirms the final total.</small></div>;
}

import {useEffect,useRef,useState} from 'react';
const defaultFormat=(value:number)=>Math.round(value).toLocaleString('uk-UA');
export default function AnimatedNumber({value,format=defaultFormat}:{value:number;format?:(value:number)=>string}) {
 const target=Number.isFinite(value)?value:0;
 const [shown,setShown]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?target:0);
 const current=useRef(0);
 useEffect(()=>{
   const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
   let frame=0;
   const finish=()=>{cancelAnimationFrame(frame);current.current=target;setShown(target)};
   const onPreference=()=>{if(preference.matches)finish()};
   preference.addEventListener('change',onPreference);
   if(preference.matches)finish();
   else {
     const from=current.current;const start=performance.now();
     const tick=(now:number)=>{const progress=Math.min(1,(now-start)/950);const next=from+(target-from)*(1-Math.pow(1-progress,3));current.current=next;setShown(progress===1?target:next);if(progress<1)frame=requestAnimationFrame(tick)};
     frame=requestAnimationFrame(tick);
   }
   return()=>{cancelAnimationFrame(frame);preference.removeEventListener('change',onPreference)};
 },[target]);
 return <span className="animated-number"><span className="sr-only">{format(target)}</span><span aria-hidden="true">{format(shown)}</span></span>;
}

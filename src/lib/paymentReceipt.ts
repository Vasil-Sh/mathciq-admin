import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartNoAxesCombined} from 'lucide-react';
type ReceiptPayment = {
  id:string; amount:string; paidOn:string; periodStart:string; periodEnd:string;
  createdBy:string; status:string; username?:string;
};
const date=(value:string)=>value.split('-').reverse().join('.');

/** Preview and download use the same locally generated image. */
export async function createPaymentReceipt(payment:ReceiptPayment,user:{username:string;telegram:string}) {
  if(payment.status !== 'recorded') throw new Error('Чек доступний лише для не скасованої оплати.');
  await document.fonts.ready;
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('Не вдалося створити зображення.');
  const width=440,pad=30,available=width-2*pad;
  const brandColor='#4278f5';
  const logo=new Image();
  const logoSvg=renderToStaticMarkup(createElement(ChartNoAxesCombined,{size:40,color:brandColor,strokeWidth:2,xmlns:'http://www.w3.org/2000/svg'}));
  await new Promise<void>((resolve,reject)=>{logo.onload=()=>resolve();logo.onerror=()=>reject(new Error('Не вдалося завантажити логотип.'));logo.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;});
  let y=100;
  const commands:(()=>void)[]=[];
  function text(value:string,size=16,bold=false,align:'left'|'center'|'right'='left') {
    const font=`${bold?700:400} ${size}px Arial, sans-serif`;
    ctx!.font=font;
    const lines:string[]=[];let line='';
    for(const c of value.replace(/[\r\n]+/g,' ')) {
      if(line&&ctx!.measureText(line+c).width>available){lines.push(line);line=c;}else line+=c;
    }
    if(line)lines.push(line);
    for(const value of lines){const baseline=y;commands.push(()=>{ctx!.font=font;ctx!.fillStyle='#202020';ctx!.textAlign=align;ctx!.fillText(value,align==='center'?width/2:align==='right'?width-pad:pad,baseline)});y+=size*1.45;}
  }
  function rule(){y+=10;const baseline=y;commands.push(()=>{ctx!.strokeStyle='#a5a5a5';ctx!.lineWidth=1;ctx!.setLineDash([6,5]);ctx!.beginPath();ctx!.moveTo(pad,baseline);ctx!.lineTo(width-pad,baseline);ctx!.stroke();ctx!.setLineDash([])});y+=27;}
  const money=`${Number(payment.amount).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})} грн`;
  commands.push(()=>{
    ctx.font='700 34px Arial, sans-serif';
    const nameWidth=ctx.measureText('MatchIQ').width;
    const left=(width-40-12-nameWidth)/2;
    ctx.drawImage(logo,left,31,40,40);
    ctx.fillStyle=brandColor;ctx.textAlign='left';ctx.fillText('MatchIQ',left+52,63);
  });
  text('Трекер ставок на кіберспорт',15,false,'center');
  text('Підтвердження оплати',17,true,'center');y+=12;
  text(`Чек № MIQ-${payment.id}`,18,true,'center');
  text(date(payment.paidOn),15,false,'center');
  rule();
  text('КОРИСТУВАЧ',12);text(payment.username||user.username,18,true);
  if(user.telegram){y+=12;text('Telegram',12);text(user.telegram.trim().replace(/^@/,''),18,true);}
  y+=12;text('ОПЛАЧЕНИЙ ПЕРІОД',12);
  text(`${date(payment.periodStart)} — ${date(payment.periodEnd)}`,17);
  rule();
  text('Доступ до MatchIQ',18,true);
  text(`1 × ${money}`,16);
  text(money,18,false,'right');
  rule();
  text('СУМА',18,true);text(money,28,true,'right');
  text('Статус: оплату записано',15);
  rule();
  text('Підтримка з питань оплати',14,false,'center');
  text('Telegram: @cs2beet',16,true,'center');y+=16;
  text('Дякуємо, що обираєш MatchIQ!',16,true,'center');y+=10;
  text('Підтвердження ручного запису.',12,false,'center');
  text('Не є фіскальним чеком',10,false,'center');
  text('або банківською квитанцією.',10,false,'center');
  canvas.width=width*2;canvas.height=Math.ceil(y+24)*2;
  ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,y+24);
  commands.forEach(draw=>draw());
  return canvas.toDataURL('image/png');
}
export function savePaymentReceipt(image:string,id:string) {
  const link=document.createElement('a');link.href=image;link.download=`MatchIQ-payment-${id}.png`;
  document.body.appendChild(link);link.click();link.remove();
}

import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import MonthlyReport from './src/components/MonthlyReport';
function render(revenue:number,paidUsers:number,previousRevenue:Record<string,number>,registrations=1) {
 return renderToStaticMarkup(<MonthlyReport months={[{month:'2026-10',label:'October',revenue,paidUsers}]} registrations={{'2026-10':registrations}} previousRevenue={previousRevenue} revenueTotal={revenue} registrationTotal={registrations}/>);
}
const html=render(110,2,{'2026-09':10});
assert(html.includes('₴55'));assert(html.includes('+₴100'));assert(html.includes('+1000%'));
assert(!html.includes('monthly-change-bar'));
assert(render(110,2,{'2026-09':0}).includes('Попередній місяць: ₴0'));
assert(render(110,2,{}).includes('Немає даних за попередній місяць'));
assert(render(0,0,{}).includes('На платного користувача'));
assert(!render(0,0,{}).includes('NaN'));
assert(render(110,2,{'2026-09':10},0).includes('₴55'));
console.log('Monthly report: correct paid denominator, zero registrations, zero base, missing month, monetary delta passed');

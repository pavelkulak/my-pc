export const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
export function createState(){return {powered:false,color:'#ff9d50',brightness:.75,effect:'solid',speed:0,powerAmount:0,panels:{side:false,front:false,top:false}};}
export function lightLevel(state,time){
 const effect=state.effect==='breathe'?.34+.66*(.5+.5*Math.sin(time*1.7)):1;
 return clamp(state.powerAmount)*clamp(state.brightness)*effect;
}
export function advancePower(state,dt){
 dt=clamp(dt,0,.05);
 state.speed+=(Number(state.powered)-state.speed)*(1-Math.exp(-dt*(state.powered?2.5:1.8)));
 state.powerAmount+=(Number(state.powered)-state.powerAmount)*(1-Math.exp(-dt*5));
 if(state.speed<.0001)state.speed=0;if(state.powerAmount<.0001)state.powerAmount=0;
}
export function hexColor(value){return /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'#ff9d50';}

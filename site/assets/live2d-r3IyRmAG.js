(function(){try{var e=typeof globalThis<`u`?globalThis:typeof window<`u`?window:typeof global<`u`?global:typeof self<`u`?self:{},t=new e.Error().stack;t&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[t]=`5ec0f7d1-155b-4c20-bf4f-15f14be6749a`,e._sentryDebugIdIdentifier=`sentry-dbid-5ec0f7d1-155b-4c20-bf4f-15f14be6749a`)}catch{}})();import{$ as e,En as t,Ft as n,Ht as r,J as i,_ as a,b as o,bt as s,ct as c,er as l,ft as u,g as d,gt as f,k as p,mt as m,o as h,v as g,vn as _,wn as v,xn as y,xt as b,y as x}from"./runtime-core.esm-bundler-BlcJvvAw.js";import{t as S}from"./src-D-wQQdy7.js";import{d as C,mt as w,n as T}from"./dist-CSh2t7Yf.js";import{a as E}from"./pinia-Bb5A80_0.js";import"./src-fuvwCQxi.js";import{n as ee}from"./screen-oZpNNP9A.js";import{Ft as D,It as O}from"./auxiliary-BxPSY3q6.js";import{a as k}from"./environment-m-22PzUh.js";import{N as te}from"./model-assets-CKJweXZa.js";import{t as A}from"./clamp-B1evkRnV.js";import{A as j,D as M,E as ne,O as N,T as P,_ as re,a as ie,b as ae,c as oe,d as se,f as ce,g as le,h as ue,i as de,k as F,l as fe,m as pe,n as me,o as he,p as ge,r as _e,s as ve,u as ye,v as be,w as xe,x as Se,y as Ce}from"./live2d-BQnn106P.js";import{i as I,r as we}from"./manifest-1hIs0_hM.js";import{r as Te}from"./src-BFOinq4j.js";import{n as Ee}from"./animation-Ct96h9tm.js";import{A as L,M as R,N as De,O as Oe,_ as ke,a as Ae,b as je,g as Me,i as z,j as Ne,p as Pe,r as Fe,s as B}from"./display-DRPBSORs.js";import{t as Ie}from"./app-Bk7FkyS4.js";import{a as Le,l as Re,u as ze}from"./beat-sync-1yEUhO0x.js";import{a as Be,f as Ve,g as He,n as Ue}from"./stores-BDjcj981.js";import{a as We,i as Ge,r as Ke}from"./cubism4.es-BYdtWprA.js";function qe(e){let t=y([]),n=d(()=>t.value.filter(e)),r;function i(e){t.value=[...new Map(e.map(e=>[e.fileName,e])).values()]}function a(e){return n.value.find(t=>t.fileName===e)}function o(e){r=e}async function s(e){let t=a(e);return!t||!r?!1:r.play(t)}function c(){t.value=[],r=void 0}return{available:t,enabled:n,register:i,resolve:a,setExecutor:o,execute:s,clear:c}}var V=Symbol(`live2d-context`);function H(e={}){let n,r=D();function i(){return t(e.controlPolicy)??r}let a=we({getParameterDefault(e){let t=n?.coreModel;if(!t)return 0;let r=t.getParameterDefaultValueById?.(e);return typeof r==`number`?r:t.getParameterValueById(e)},isEnabled(e){return O(i(),{kind:`expression`,id:e.name})}}),o=qe(e=>O(i(),{kind:`motion`,id:e.fileName}));function s(){a.clear(),o.clear(),n=void 0}function c(e){n=e}return{expressions:a,motions:o,beginModelLoad:s,setModel:c,dispose:s}}function U(e){f(V,e)}function Je(){let e=i(V);if(!e)throw Error(`useLive2D() requires a parent Live2DRoot component.`);return e}var Ye=p({__name:`expression`,props:{name:{},fileName:{},load:{type:Function}},setup(e){let t=e,n=Je(),i=y();return r([()=>t.name,()=>t.fileName,()=>t.load],async([e,t,r],a,o)=>{let s=!0,c;i.value=void 0,o(()=>{s=!1,c?.()});try{let a=await r(t);if(!s)return;let o=I(e,t,a);c=n.expressions.register(o),i.value=o}catch(t){s&&console.warn(`[Live2D] Skipped optional expression ${e}:`,t)}},{immediate:!0}),(e,t)=>i.value?b(e.$slots,`default`,{definition:i.value},void 0,void 0,0):x(``,!0)}}),Xe=p({__name:`Canvas`,props:e({width:{},height:{},backgroundUrl:{},resolution:{default:2},maxFps:{default:0}},{state:{default:`pending`},stateModifiers:{}}),emits:e([`error`],[`update:state`]),setup(e,{expose:t,emit:i}){let a=e,s=i,d=n(e,`state`),f=_(),p=_(!1),h=y(),g=_();function v(e){return!e||e<=0?0:Math.max(1,Math.round(e))}let S;function C(e){let t=()=>{try{e.render()}catch(t){console.error(`[Live2D] Pixi render error.`,t),e.ticker.stop(),s(`error`,t instanceof Error?t:Error(String(t)))}};e.ticker.remove(e.render,e),e.ticker.add(t),e.ticker.maxFPS=v(a.maxFps),S=t}async function w(e){d.value=`loading`,p.value=!1,Ge.registerTicker(Me),je.add(ke),je.add(z),h.value=new Ie({width:a.width*a.resolution,height:a.height*a.resolution,backgroundAlpha:0,preserveDrawingBuffer:!0,autoDensity:!1,resolution:1}),C(h.value),h.value.stage.scale.set(a.resolution),h.value.stage.sortableChildren=!0,g.value=h.value.view,g.value.style.width=`100%`,g.value.style.height=`100%`,g.value.style.objectFit=`cover`,g.value.style.display=`block`,e.appendChild(h.value.view),p.value=!0,d.value=`mounted`,await O()}let T=y();function E(){let e=T.value;if(!e||!a.width||!a.height)return;let t=ee({width:a.width,height:a.height},e.texture);e.x=t.x,e.y=t.y,e.width=t.width,e.height=t.height}async function D(e){let t=new Image;return t.src=e,await t.decode(),B.from(t)}async function O(){let e=h.value;if(!e)return;let t=a.backgroundUrl;if(!t){T.value&&=(e.stage.removeChild(T.value),T.value.destroy({baseTexture:!0,texture:!0}),void 0);return}let n;try{n=await D(t)}catch{return}if(a.backgroundUrl!==t||h.value!==e)n.destroy(!0);else{if(T.value){let e=T.value.texture;T.value.texture=n,e.destroy(!0)}else{let t=new ze(n);T.value=t,e.stage.addChildAt(t,0)}E()}}function k(){h.value&&(h.value.renderer.resize(a.width*a.resolution,a.height*a.resolution),h.value.stage.scale.set(a.resolution)),E(),S?.()}r([()=>a.width,()=>a.height,()=>a.resolution],k,{flush:`post`}),r(()=>a.backgroundUrl,()=>void O()),r(()=>a.maxFps,e=>{h.value&&(h.value.ticker.maxFPS=v(e))}),c(async()=>{if(f.value)try{await w(f.value)}catch(e){console.error(`[Live2D] Failed to initialize Pixi stage.`,e),s(`error`,e instanceof Error?e:Error(String(e)))}}),u(()=>{T.value?.destroy({baseTexture:!0,texture:!0}),T.value=void 0,h.value?.destroy(),h.value=void 0,S=void 0});async function te(){return new Promise(e=>{if(!g.value||!h.value)return e(null);try{h.value.render()}catch(t){return console.error(`[Live2D] Pixi render error during capture.`,t),s(`error`,t instanceof Error?t:Error(String(t))),e(null)}g.value.toBlob(e)})}function A(){return g.value}return t({captureFrame:te,canvasElement:A}),(e,t)=>(m(),o(`div`,{ref_key:`containerRef`,ref:f,class:`w-full`,style:l({height:`${a.height}px`})},[p.value?b(e.$slots,`default`,{app:h.value},void 0,void 0,0):x(``,!0)],4))}}),W={"punchy-v":{topYaw:10,topRoll:8,bottomDip:4,pattern:`v`},"balanced-v":{topYaw:6,topRoll:0,bottomDip:6,pattern:`v`},"swing-lr":{topYaw:8,topRoll:0,bottomDip:6,swingLift:8,pattern:`swing`},"sway-sine":{topYaw:10,topRoll:0,bottomDip:0,swingLift:10,pattern:`sway`}};function Ze(e){let{baseAngles:t,releaseDelayMs:n=1800,defaultIntervalMs:r=600,styles:i={},initialStyle:a=`punchy-v`,autoStyleShift:o=!1,now:s=()=>performance.now()}=e,c={...W,...i},l=_(0),u=_(0),f=_(0),p=_(0),m=_(0),h=_(0),g=_([]),v=_(`left`),y=_(!1),b=_(!1),x=_(null),S=_(null),C=_(null),w=_(a),T=_(o),E=d(()=>t());function ee(e,t,n){return e+(t-e)*n}function D(e){return 1-(1-e)**3}function O(){return c[w.value]||W[`punchy-v`]}function k(e){let{topYaw:t,topRoll:n,swingLift:r,pattern:i}=O(),a=e===`left`?-1:1,o=i===`swing`||i===`sway`?r??n:n,s=E.value.z+(i===`swing`||i===`sway`?o:a*o);return{y:E.value.y+a*t,z:s}}function te(){let{bottomDip:e}=O();return{y:E.value.y,z:E.value.z-e}}function A(e=s()){let t=u.value,r=f.value;for(!y.value&&!g.value.length&&(t=E.value.y,r=E.value.z),t??=E.value.y,r??=E.value.z;g.value.length;){let n=g.value[0];if(e<n.start){t=n.fromY,r=n.fromZ;break}let i=Math.min(1,(e-n.start)/Math.max(n.duration,1)),a=D(i);if(t=ee(n.fromY,n.toY,a),r=ee(n.fromZ,n.toZ,a),i>=1)g.value.shift();else break}let i=x.value,a=y.value&&i!=null?e-i:1/0;y.value&&!g.value.length&&a>n&&(y.value=!1,b.value=!1,v.value=`left`,g.value=[],x.value=null,t=E.value.y,r=E.value.z,m.value*=.5,h.value*=.5),u.value=t,f.value=r}function j(e){let t=e!=null&&Number.isFinite(e)?Number(e):s();if(A(t),!y.value){y.value=!0,x.value=t;return}let n=Math.min(2e3,Math.max(220,x.value==null?r:t-x.value));if(x.value=t,S.value=n,C.value=C.value==null?n:C.value*.7+n*.3,T.value&&C.value){let e=6e4/C.value,t=e<120?`swing-lr`:e<180?`balanced-v`:`punchy-v`;t!==w.value&&(w.value=t)}let i=Math.max(80,n/2),a={y:u.value,z:f.value};g.value=[];let o=O(),c=v.value===`left`?`right`:`left`;if(o.pattern===`v`){if(!b.value){let e=k(`left`);g.value.push({start:t,duration:i,fromY:a.y,fromZ:a.z,toY:e.y,toZ:e.z}),b.value=!0,v.value=`left`;return}let e=te(),n=k(c);g.value.push({start:t,duration:i,fromY:a.y,fromZ:a.z,toY:e.y,toZ:e.z}),g.value.push({start:t+i,duration:i,fromY:e.y,fromZ:e.z,toY:n.y,toZ:n.z}),v.value=c}else if(o.pattern===`swing`){let e=v.value,r=k(e),i=k(c),o=Math.max(60,n*.35),s=Math.max(60,n-o);g.value.push({start:t,duration:o,fromY:a.y,fromZ:a.z,toY:r.y,toZ:r.z}),g.value.push({start:t+o,duration:s,fromY:r.y,fromZ:r.z,toY:i.y,toZ:i.z}),b.value=!0,v.value=c}else if(o.pattern===`sway`){let e=v.value,r=k(e),s=k(c),l={y:E.value.y,z:E.value.z},u=o.swingLift??10;if(!b.value){g.value.push({start:t,duration:i,fromY:a.y,fromZ:a.z,toY:r.y,toZ:r.z}),b.value=!0,v.value=e;return}let d={y:0,z:l.z+u},f=Math.max(60,n*.5),p=Math.max(60,n-f);g.value.push({start:t,duration:f,fromY:a.y,fromZ:a.z,toY:d.y,toZ:d.z}),g.value.push({start:t+f,duration:p,fromY:d.y,fromZ:d.z,toY:s.y,toZ:s.z}),b.value=!0,v.value=c}}return{targetX:l,targetY:u,targetZ:f,velocityX:p,velocityY:m,velocityZ:h,updateTargets:A,targetOffsets:()=>({y:u.value-E.value.y,z:f.value-E.value.z}),scheduleBeat:j,setStyle:e=>{w.value=e},getStyle:()=>w.value,setAutoStyleShift:e=>{T.value=e},debugState:()=>({primed:y.value,patternStarted:b.value,lastBeatTimestamp:x.value,lastInterval:S.value,avgInterval:C.value,bpm:C.value?6e4/C.value:null,style:w.value,segments:[...g.value]})}}var Qe=new Set([`head`,`face`]),$e=[`ParamAngleX`,`ParamAngleY`,`ParamAngleZ`],G=.6,et=1/30,tt=.2;function nt(e,t){let n=Math.max(e.x+e.width,t.x+t.width),r=Math.max(e.y+e.height,t.y+t.height);e.x=Math.min(e.x,t.x),e.y=Math.min(e.y,t.y),e.width=n-e.x,e.height=r-e.y}function rt(e,t){let n=[];for(let r=0;r<t;r++)n.push({...e.getDrawableBounds(r)});return n}function it(e,t){return Math.hypot(t.x-e.x,t.y-e.y)+Math.hypot(t.width-e.width,t.height-e.height)}function at(){let e,t=!1;function n(e){let t=Object.entries(e.hitAreas).find(([e])=>Qe.has(e.toLowerCase()))?.[1];return t?[t.index]:void 0}function r(e){let t=e.coreModel,n=t.getDrawableCount(),r=(e=>e.map(e=>({id:e,index:t.getParameterIndex(e)})).filter(e=>e.index>=0))($e);if(r.length===0||n===0)return;let i=r.map(e=>t.getParameterValueById(e.id)),a=()=>r.forEach((e,n)=>t.setParameterValueById(e.id,i[n])),o=()=>{let n=Math.ceil(G/et);for(let r=0;r<n;r++)e.physics?.evaluate(t,et);t.update()},s=(e,n)=>{let r=t.getParameterMaximumValue(e.index),i=t.getParameterMinimumValue(e.index);return Math.abs(r-n)>=Math.abs(n-i)?r:i};a(),o();let c=rt(e,n);r.forEach((e,n)=>t.setParameterValueById(e.id,s(e,i[n]))),o();let l=rt(e,n);a(),o();let u=c.map((e,t)=>it(e,l[t])),d=Math.max(...u);if(d<=0)return;let f=u.map((e,t)=>({distance:e,index:t})).filter(e=>e.distance>=d*tt).map(e=>e.index);return f.length>0?f:void 0}return{bounds(i){if(t||(t=!0,e=n(i)??r(i)),!e)return;let a;for(let t of e){let e=i.getDrawableBounds(t);e.width<=0||e.height<=0||(a?nt(a,e):a={...e})}return a?{x:a.x,y:a.y,width:a.width,height:a.height}:void 0},reset(){e=void 0,t=!1}}}function K(e,t,n){let r=t.apply(e);return n.apply(r)}function ot(e,t,n){let r=K(e,t,n),i=K({x:e.x+e.width,y:e.y+e.height},t,n);return{x:Math.min(r.x,i.x),y:Math.min(r.y,i.y),width:Math.abs(i.x-r.x),height:Math.abs(i.y-r.y)}}var q=C(T),J=d(()=>k()&&q.smallerOrEqual(`md`).value?.75:1);function st(e,n){return d(()=>{let r=t(e),i=t(n),a=r.height/i.height*2,o=r.width/i.width*2,s=Math.min(a,o);return(Number.isNaN(s)||s<=0)&&(s=1e-6),{scale:s,x:r.width/2,y:r.height*J.value}})}var ct=function(e){return e.Happy=`happy`,e.Sad=`sad`,e.Angry=`angry`,e.Think=`think`,e.Surprise=`surprised`,e.Awkward=`awkward`,e.Question=`question`,e.Curious=`curious`,e.Neutral=`neutral`,e}({});Object.values(ct);var lt=`Idle`,ut=16,Y=.5,dt=6,ft=.5,pt=.004,mt=`
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform highp vec2 uSourceScale;
uniform highp vec4 uSourceClamp;
uniform highp vec2 uTapStep;
uniform float uReadAlpha;
uniform vec2 uWeights[7];

vec2 coverageAt(vec2 coord) {
  vec4 texel = texture2D(uSampler, clamp(coord, uSourceClamp.xy, uSourceClamp.zw));
  return mix(texel.rg, texel.aa, uReadAlpha);
}

void main(void) {
  vec2 center = vTextureCoord * uSourceScale;
  vec2 sum = coverageAt(center) * uWeights[0];
  for (int tap = 1; tap <= ${dt}; tap += 1) {
    vec2 offset = uTapStep * float(tap);
    sum += (coverageAt(center + offset) + coverageAt(center - offset)) * uWeights[tap];
  }
  gl_FragColor = vec4(sum, 0.0, 1.0);
}
`,ht=`
varying vec2 vTextureCoord;

uniform sampler2D uSampler;

// The clamp holds texture coordinates on a texture up to 2048 pixels wide, and
// the default mediump float of a fragment shader cannot resolve one texel at
// that size.
uniform highp vec4 inputClamp;

// Pixi sets this global uniform to the rectangle that the filter covers, in
// stage pixels. The default vertex shader declares it with no precision
// qualifier, which means highp in a vertex shader, and a uniform declared with
// two precisions in one program fails to link. This declaration must therefore
// stay highp.
uniform highp vec4 outputFrame;

uniform sampler2D uWrapAlpha;
uniform highp vec2 uWrapScale;
uniform highp vec4 uWrapClamp;
uniform sampler2D uSurroundMap;
uniform sampler2D uContactMap;
uniform vec3 uSurroundAverage;
uniform vec3 uContactAverage;
uniform highp vec2 uStageSize;
uniform float uBacklight;
uniform float uDirectional;
uniform float uStrength;
uniform float uDisplayLevel;
uniform float uDarkBase;
uniform float uBaseCurve;
uniform float uLocalShare;
uniform float uTint;
uniform float uColorBoost;
uniform float uWrapIntensity;
uniform float uWrapSaturation;
uniform float uTranslucentWrap;
// How far the maps reach past the window on each axis, in units of that axis.
// The two differ whenever the window is not square and they stand for the same
// distance on screen. The measurement places the texels with this pair, so the
// two disagree about every position if they differ.
uniform vec2 uMapMargin;
// Where the renderer drew its subject inside the stage window, as x, y, width
// and height in window units. The measurement places the maps around this
// rectangle, so reading them anywhere else lands on the wrong texel: a window
// wider than its subject would otherwise stretch the maps across its empty
// half.
uniform highp vec4 uSubjectRect;

const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgb(vec3 color) {
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

// Public-domain linear sRGB / Oklab matrices by Bjorn Ottosson:
// https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
vec3 toOklab(vec3 c) {
  vec3 lms = vec3(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
                  dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
                  dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
              dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}

vec3 fromOklab(vec3 c) {
  vec3 lms = vec3(c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
                  c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
                  c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  lms = lms * lms * lms;
  return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
              dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
              dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
}

/**
 * Moves a lit color further from its unlit self in hue, at the same luminance.
 *
 * A saturated light carries little energy: blue at full strength has 7% of the
 * luminance of white, so light that looks strongly blue barely moves the model.
 * The extra chroma grows with the saturation of the light and falls as the
 * light gets brighter, so it lifts the dim colored case and leaves a bright one
 * as the physics produced it.
 *
 * Two limits keep the result honest. The shift is projected onto constant
 * linear luminance, because Oklab lightness is perceptual and not luminance, so
 * moving chroma alone would still change how bright the fragment is. It is then
 * shortened until every channel stays between the unlit color and white: light
 * may only add, so no channel may fall below what the model shows with the
 * screen switched off.
 */
vec3 enhanceLightColor(vec3 unlit, vec3 lit, vec3 incident) {
  float peak = max(incident.r, max(incident.g, incident.b));
  float low = min(incident.r, min(incident.g, incident.b));
  if (uColorBoost <= 0.0 || peak <= 0.000001 || peak - low <= peak * 0.001)
    return lit;

  float intensity = dot(lit - unlit, luminanceWeights);
  if (intensity <= 0.000001)
    return lit;

  float saturation = (peak - low) / peak;
  vec3 unlitLab = toOklab(unlit);
  vec3 litLab = toOklab(lit);
  // The gain halves at an added luminance of 0.04, which is an sRGB gray of
  // about #383838: brighter light than that needs no help to read as colored.
  float extra = uColorBoost * saturation * saturation / (1.0 + intensity / 0.04);
  vec3 target = fromOklab(vec3(litLab.x, litLab.yz + extra * (litLab.yz - unlitLab.yz)));

  vec3 shift = target - lit;
  shift -= vec3(dot(shift, luminanceWeights));
  vec3 allowance = mix(lit - unlit, vec3(1.0) - lit, step(vec3(0.0), shift));
  vec3 limits = allowance / max(abs(shift), vec3(0.000001));
  float amount = clamp(min(limits.r, min(limits.g, limits.b)), 0.0, 1.0);
  return clamp(lit + amount * shift, min(unlit, lit), vec3(1.0));
}

void main(void) {
  vec4 source = texture2D(uSampler, vTextureCoord);
  if (source.a <= 0.0) {
    gl_FragColor = source;
    return;
  }

  // Pixi hands out filter textures from a pool, so the texture is usually
  // larger than the model frame and the frame starts at the texture origin.
  // inputClamp marks the frame, and every position below is relative to it.
  vec2 frameExtent = max(inputClamp.zw - inputClamp.xy, vec2(0.0001));
  vec2 frameCoord = (vTextureCoord - inputClamp.xy) / frameExtent;

  // Where this fragment sits on the stage, and then inside the light maps.
  // Every light lookup below uses this position, so a sleeve takes the color
  // of the screen beside the sleeve rather than a color shared by its whole
  // side of the model.
  vec2 windowUv = (outputFrame.xy + frameCoord * outputFrame.zw) / uStageSize;
  vec2 subjectUv = (windowUv - uSubjectRect.xy) / max(uSubjectRect.zw, vec2(0.0001));
  vec2 mapUv = (subjectUv + uMapMargin) / (vec2(1.0) + 2.0 * uMapMargin);

  vec3 baseLinear = srgbToLinear(source.rgb / source.a);

  // Global mode replaces both lookups with the mean of the map, so the whole
  // model takes one color.
  vec3 surround = mix(uSurroundAverage, srgbToLinear(texture2D(uSurroundMap, mapUv).rgb), uDirectional);
  vec3 contact = mix(uContactAverage, srgbToLinear(texture2D(uContactMap, mapUv).rgb), uDirectional);

  // The model reflects the light it stands in. Its painted colors are its
  // reflectance under the painter's white light, so the screen light scales
  // them: a white screen shows the model as drawn, a dark screen dims it to
  // the floor, and a colored screen colors it.
  //
  // The level of that light comes from two places. uDisplayLevel is the mean of
  // the whole display, so the character keeps one exposure while the user drags
  // its window across the desktop. The map at this fragment supplies the rest,
  // which is what keeps the side facing a bright window brighter than the far
  // side. The tint keeps only the luminance of the map at 0, so the model then
  // follows the screen brightness with its own colors.
  //
  // Nothing here subtracts. A channel the screen lacks falls no lower than
  // uDarkBase, which stands for the light the room gives without the screen, so
  // a saturated screen cannot drain a channel out of the artwork. Strength
  // stops at 1, because more of it could only darken the model; the bands take
  // the rest.
  float effect = min(uStrength, 1.0);
  vec3 shaped = mix(vec3(dot(surround, luminanceWeights)), surround, uTint);
  vec3 incoming = mix(vec3(uDisplayLevel), shaped, uLocalShare);
  vec3 reflectance = uDarkBase + (1.0 - uDarkBase) * pow(max(incoming, vec3(0.0)), vec3(uBaseCurve));
  vec3 unlit = baseLinear * (1.0 - (1.0 - uDarkBase) * effect);
  vec3 tinted = baseLinear * mix(vec3(1.0), reflectance, effect);

  // Mixing toward the luminance keeps the amount of light, so the saturation
  // control moves the hue of the band and not its brightness.
  vec3 wrapColor = mix(vec3(dot(contact, luminanceWeights)), contact, uWrapSaturation);

  // Light wrap: the plate color bleeds around the edge of the model, the way a
  // compositor blends a foreground element into its plate. The stage window is
  // transparent, so the desktop behind the model is a real plate.
  //
  // The blurred alpha falls below one only near a silhouette, so its product
  // with the model alpha forms a band that fades inward. The blur is a
  // Gaussian, so the band is continuous in the distance to the edge and has no
  // inner boundary of its own. The color comes from the narrow blur at the
  // fragment position, because what shows behind a gap between two strands is
  // the desktop at that position. A strand thinner than the band takes the
  // band over its whole width.
  vec2 blurredAlpha = texture2D(uWrapAlpha, clamp(vTextureCoord * uWrapScale, uWrapClamp.xy, uWrapClamp.zw)).rg;

  // The bands scale with the model alpha. The translucent-wrap option squares
  // it, so a part drawn with partial alpha receives less of the plate color
  // that it already shows through itself. An opaque part is the same either
  // way.
  float coverage = source.a * mix(1.0, source.a, uTranslucentWrap);
  float rimMask = coverage * (1.0 - blurredAlpha.r);
  float wrapMask = coverage * (1.0 - blurredAlpha.g);

  // The wide band is the wrap. The thin band is the backlight rim, the bright
  // line a subject shows in front of a bright plate. Both follow the light
  // behind each part of the edge, so an edge in front of a dark area stays
  // dark.
  vec3 added = wrapColor * uStrength * (wrapMask * uWrapIntensity + rimMask * uBacklight);

  // Added light compresses into the remaining headroom instead of clipping, so
  // bright texture detail under a strong wrap keeps its differences. One factor
  // covers all three channels, taken from whichever channel has the least room
  // left: compressing each channel on its own would let a bright colored wrap
  // keep its strongest channel while cutting the others, and the band would
  // turn white exactly where the screen color should show most.
  vec3 headroom = max(vec3(0.0), vec3(1.0) - tinted);
  vec3 load = added / max(headroom, vec3(0.0001));
  float peakLoad = max(load.r, max(load.g, load.b));
  float compression = peakLoad > 0.0 ? (1.0 - exp(-peakLoad)) / peakLoad : 1.0;
  vec3 litLinear = clamp(tinted + added * compression, 0.0, 1.0);

  // One boost over everything the screen contributed, measured against the
  // model as it looks with the screen switched off.
  vec3 unlitClamped = clamp(unlit, 0.0, 1.0);
  litLinear = enhanceLightColor(unlitClamped, litLinear, max(litLinear - unlitClamped, vec3(0.0)));

  gl_FragColor = vec4(linearToSrgb(litLinear) * source.a, source.a);
}
`,gt=class extends Ae{surroundTexels;contactTexels;surroundTexture;contactTexture;surroundAverage=new Float32Array([1,1,1]);contactAverage=new Float32Array([1,1,1]);stageSize=new Float32Array([1,1]);contactPeak=0;blurPass;blurWeights=new Float32Array(14);wrapDiffuse=P.filter.wrapDiffuse;uploadedEnvironment;constructor(){let e=new Uint8Array(2304),t=new Uint8Array(2304);e.fill(255),t.fill(255);let n=Z(e),r=Z(t);super(void 0,ht,{uWrapAlpha:B.WHITE,uWrapScale:new Float32Array([1,1]),uWrapClamp:new Float32Array([0,0,1,1]),uSurroundMap:n,uContactMap:r,uSurroundAverage:new Float32Array([1,1,1]),uContactAverage:new Float32Array([1,1,1]),uStageSize:new Float32Array([1,1]),uBacklight:P.filter.backlight,uDirectional:0,uStrength:0,uDisplayLevel:1,uDarkBase:P.filter.darkBase,uBaseCurve:P.filter.baseCurve,uLocalShare:P.filter.localShare,uTint:P.filter.tint,uColorBoost:P.filter.colorBoost,uWrapIntensity:P.filter.wrapIntensity,uWrapSaturation:P.filter.wrapSaturation,uTranslucentWrap:0,uMapMargin:new Float32Array([M.x,M.y]),uSubjectRect:new Float32Array([0,0,1,1])}),this.surroundTexels=e,this.contactTexels=t,this.surroundTexture=n,this.contactTexture=r,this.padding=ut,this.blurPass=new Ae(void 0,mt,{uSourceScale:new Float32Array([1,1]),uSourceClamp:new Float32Array([0,0,1,1]),uTapStep:new Float32Array([0,0]),uReadAlpha:1,uWeights:this.blurWeights})}update(e){let{environment:t,options:n}=e;t!==this.uploadedEnvironment&&(this.uploadMaps(t),this.uploadedEnvironment=t),this.uniforms.uDirectional=+(e.mode===`window-gradient`),this.uniforms.uStrength=A(e.strength,0,3),this.uniforms.uMapMargin[0]=t.mapMargin.x,this.uniforms.uMapMargin[1]=t.mapMargin.y;let r=e.subject??j;this.uniforms.uSubjectRect[0]=r.x,this.uniforms.uSubjectRect[1]=r.y,this.uniforms.uSubjectRect[2]=Math.max(r.width,1e-4),this.uniforms.uSubjectRect[3]=Math.max(r.height,1e-4),this.uniforms.uDisplayLevel=A(t.displayLuminance,0,1),this.uniforms.uDarkBase=A(n.darkBase,0,1),this.uniforms.uBaseCurve=A(n.baseCurve,.25,4),this.uniforms.uLocalShare=A(n.localShare,0,1),this.uniforms.uTint=A(n.tint,0,1),this.uniforms.uColorBoost=A(n.colorBoost,0,10),this.uniforms.uWrapIntensity=Math.max(0,n.wrapIntensity),this.uniforms.uWrapSaturation=A(n.wrapSaturation,0,1),this.uniforms.uBacklight=A(n.backlight,0,4),this.uniforms.uTranslucentWrap=+!!n.translucentWrap,this.wrapDiffuse=A(n.wrapDiffuse,0,.5)}apply(e,t,n,r){let i=e.renderer.screen;if(this.stageSize[0]=Math.max(1,i.width),this.stageSize[1]=Math.max(1,i.height),this.uniforms.uStageSize=this.stageSize,!this.needsBands()){this.uniforms.uWrapAlpha=B.WHITE,e.applyFilter(this,t,n,r);return}let a=t.filterFrame??t.frame,o=t.resolution*Y,s=e.getFilterTexture(t,o),c=e.getFilterTexture(t,o),l=Math.max(a.height,1),u=.5*this.wrapDiffuse*l,d=pt*l,f=Math.max(u,d)*ft;vt(this.blurWeights,f,d,u);let p=this.blurPass;p.uniforms.uReadAlpha=1,_t(p,t,t),p.uniforms.uTapStep[0]=f/t.width,p.uniforms.uTapStep[1]=0,e.applyFilter(p,t,s,L.CLEAR),p.uniforms.uReadAlpha=0,_t(p,t,s),p.uniforms.uTapStep[0]=0,p.uniforms.uTapStep[1]=f/s.height,e.applyFilter(p,s,c,L.CLEAR),this.uniforms.uWrapAlpha=c,this.uniforms.uWrapScale[0]=t.width/c.width,this.uniforms.uWrapScale[1]=t.height/c.height,Q(this.uniforms.uWrapClamp,c),e.applyFilter(this,t,n,r),this.uniforms.uWrapAlpha=B.WHITE,e.returnFilterTexture(s),e.returnFilterTexture(c)}destroy(){super.destroy(),this.blurPass.destroy(),this.surroundTexture.destroy(!0),this.contactTexture.destroy(!0)}needsBands(){return this.uniforms.uStrength*(this.uniforms.uWrapIntensity+this.uniforms.uBacklight)*this.contactPeak>0}uploadMaps(e){yt(this.surroundTexels,e.surround),yt(this.contactTexels,e.contact),this.surroundTexture.baseTexture.update(),this.contactTexture.baseTexture.update(),this.surroundAverage.set(N(e.surround)),this.contactAverage.set(N(e.contact)),this.uniforms.uSurroundAverage=this.surroundAverage,this.uniforms.uContactAverage=this.contactAverage,this.contactPeak=X(e.contact)}};function X(e){let t=0;for(let n=0;n<e.data.length;n+=1)t=Math.max(t,e.data[n]);return Math.min(t,1)}function Z(e){return new B(Fe.fromBuffer(e,24,24,{alphaMode:Oe.NO_PREMULTIPLIED_ALPHA,mipmap:Ne.OFF,scaleMode:R.LINEAR,wrapMode:De.CLAMP}))}function _t(e,t,n){e.uniforms.uSourceScale[0]=t.width/n.width,e.uniforms.uSourceScale[1]=t.height/n.height,Q(e.uniforms.uSourceClamp,n)}function Q(e,t){let n=t.filterFrame??t.frame,r=.5/(t.width*t.resolution),i=.5/(t.height*t.resolution);e[0]=r,e[1]=i,e[2]=n.width/t.width-r,e[3]=n.height/t.height-i}function vt(e,t,n,r){let i=[Math.max(n,1e-4),Math.max(r,1e-4)];for(let[n,r]of i.entries()){let i=0;for(let a=0;a<=dt;a+=1){let o=a*t,s=Math.exp(-(o*o)/(2*r*r));e[a*2+n]=s,i+=a===0?s:2*s}for(let t=0;t<=dt;t+=1)e[t*2+n]/=i}}function yt(e,t){for(let n=0;n<576;n+=1)e[n*4]=F(t.data[n*3]),e[n*4+1]=F(t.data[n*3+1]),e[n*4+2]=F(t.data[n*3+2]),e[n*4+3]=255}var bt=.2,xt=10,St=.75,Ct=p({__name:`Model`,props:e({modelSrc:{},modelId:{},app:{},mouthOpenSize:{default:0},nowSpeaking:{type:Boolean,default:!1},width:{},height:{},paused:{type:Boolean,default:!1},focusAt:{default:()=>({x:0,y:0})},eyeTracking:{type:Boolean,default:!1},eyeFocusSourceActive:{type:Boolean,default:!1},focusBias:{type:Boolean,default:!1},themeColorsHue:{default:220.44},themeColorsHueDynamic:{type:Boolean,default:!1},live2dIdleAnimationEnabled:{type:Boolean,default:!0},live2dForceIdleEyeAnimation:{type:Boolean,default:!0},live2dAutoBlinkEnabled:{type:Boolean,default:!0},live2dForceAutoBlinkEnabled:{type:Boolean,default:!1},live2dExpressionEnabled:{type:Boolean,default:!0},live2dShadowEnabled:{type:Boolean,default:!0},screenAmbientLightActive:{type:Boolean,default:!1},screenAmbientLightFilterOptions:{default:()=>({...P.filter})},screenAmbientLightEnvironment:{default:()=>ne},screenAmbientLightSubject:{default:()=>j},screenAmbientLightMode:{default:P.mode},screenAmbientLightStrength:{default:P.strength},screenAmbientLightSquint:{default:P.squint}},{state:{default:`pending`},stateModifiers:{}}),emits:e([`modelLoaded`,`error`],[`update:state`]),setup(e,{expose:t,emit:i}){let l=e,f=i,p=n(e,`state`),{position:x,scale:C}=He(),{breathControl:T,control:ee,exclusiveOwnerId:D}=E(Be()),O=v(()=>l.modelSrc),k=_(!1),A=!1,j=new te,M=be(),ne=Ce(),N=me(),P=d(()=>Ue(M.output.value)),F=d(()=>({x:x.value.x/100*l.width+P.value.x,y:-(x.value.y/100)*l.height+P.value.y})),I=v(()=>l.app),we=v(()=>l.paused),L=v(()=>l.focusAt),R=y(),De=_(0),Oe=_(0),ke=d(()=>Math.max(0,Math.min(100,l.mouthOpenSize))),Ae=v(()=>l.nowSpeaking),je=_(0),{isDark:Me}=S(),z=y(new Re({alpha:bt,blur:xt,distance:20,rotation:45})),Ne=y(new gt),Fe,B=st(()=>({width:l.width,height:l.height}),()=>({width:De.value,height:Oe.value}));r([F,C,B],()=>{Ie()});function Ie(e=!1){if(!R.value)return;let t=B.value;if(!e){R.value.scale.set(t.scale*C.value,t.scale*C.value),R.value.x=t.x+F.value.x,R.value.y=t.y+F.value.y;return}Fe?.pause();let n={scale:R.value.scale.x,x:R.value.x,y:R.value.y};Fe=Ee(n,{scale:t.scale*C.value,x:t.x+F.value.x,y:t.y+F.value.y,duration:200,ease:`outQuad`,onUpdate:()=>{R.value&&(R.value.scale.set(n.scale,n.scale),R.value.x=n.x,R.value.y=n.y)}})}function ze(){let e=R.value;if(e)try{I.value?.stage?.removeChild(e),Tt(e)}catch(e){console.warn(`Failed to destroy the rendered Live2D model:`,e)}finally{R.value=void 0}}let qe=Ve(),V=Je(),{currentMotion:H,availableMotions:U,motionMap:Xe,modelParameters:W}=E(qe),Qe=v(()=>l.themeColorsHue),$e=v(()=>l.themeColorsHueDynamic),G=v(()=>l.live2dIdleAnimationEnabled),et=v(()=>l.eyeTracking),tt=v(()=>l.eyeFocusSourceActive),nt=v(()=>l.live2dForceIdleEyeAnimation),rt=v(()=>l.live2dAutoBlinkEnabled),it=v(()=>l.live2dForceAutoBlinkEnabled),K=v(()=>l.live2dExpressionEnabled),q=v(()=>l.live2dShadowEnabled),J=v(()=>l.screenAmbientLightActive),ut=v(()=>l.screenAmbientLightFilterOptions),Y=v(()=>l.screenAmbientLightEnvironment),dt=v(()=>l.screenAmbientLightSubject),ft=v(()=>l.screenAmbientLightMode),pt=v(()=>l.screenAmbientLightStrength),mt=v(()=>l.screenAmbientLightSquint),ht=at(),X=y([]),Z=y(),_t=y(null),Q=y(null),vt=_({group:`Idle`,index:0}),yt=Ze({baseAngles:()=>({x:W.value.angleX,y:W.value.angleY,z:W.value.angleZ}),initialStyle:`sway-sine`}),Ct=()=>M.output.value.active,wt=qe.onShouldUpdateView(()=>{Et()});function Tt(e){e.destroy({texture:!0,baseTexture:!0})}async function Et(){await w(k).not.toBeTruthy(),await j.acquire();try{await Dt()}finally{j.release()}}async function Dt(){k.value=!0,p.value=`loading`;let e=O.value,t=l.modelId;if(V.beginModelLoad(),!I.value||!I.value.stage)try{await w(()=>!!I.value&&!!I.value.stage).toBeTruthy({timeout:1500})}catch{k.value=!1,p.value=`mounted`;return}if(R.value&&(X.value=[],Z.value=void 0,ze(),ht.reset(),N.reset()),!e)console.warn(`No Live2D model source provided.`),k.value=!1,p.value=`mounted`;else try{if(A){k.value=!1,p.value=`mounted`;return}let n=new Ge;if(await Ke.setupLive2DModel(n,{url:e,id:t},{autoInteract:!1}),A||e!==O.value){Tt(n);return}U.value.forEach(e=>{e.motionName in ct?Xe.value[e.fileName]=e.motionName:Xe.value[e.fileName]=lt}),R.value=n,I.value.stage.addChild(R.value),De.value=R.value.width,Oe.value=R.value.height,R.value.anchor.set(.5,.5),Ie();let r=R.value.internalModel,i=r.coreModel,a=r.motionManager;he(r),i.setParameterValueById(`ParamMouthOpenY`,ke.value),U.value=Object.entries(a.definitions).flatMap(([e,t])=>t?.map((t,n)=>({motionName:e,motionIndex:n,fileName:t.File}))||[]).filter(Boolean),V.motions.register(U.value.map(e=>({fileName:e.fileName,group:e.motionName,index:e.motionIndex}))),V.motions.setExecutor({play:e=>At(e.group,e.index)});let o=localStorage.getItem(`selected-runtime-motion-group`),s=localStorage.getItem(`selected-runtime-motion-index`);if(o!==null&&s){let e=a.groups[o];if(e!==void 0&&a.motionGroups[e]){let t=Number.parseInt(s),n=a.motionGroups[e][t];n&&n._looper&&(n._looper.loopDuration=0,console.info(`Configured motion to loop infinitely:`,o,t))}}o!==null&&s&&G.value&&setTimeout(()=>{console.info(`Playing selected runtime motion:`,o,s),H.value={group:o,index:Number.parseInt(s)}},300),a.groups.idle&&a.motionGroups[a.groups.idle]?.forEach(e=>{e._motionData.curves.forEach(e=>{(e.id===`ParamEyeBallX`||e.id===`ParamEyeBallY`)&&(e.id=`_${e.id}`)})});let c=ve({internalModel:r,motionManager:a,modelParameters:W,live2dEyeTrackingEnabled:et,live2dEyeFocusSourceActive:tt,live2dIdleAnimationEnabled:G,live2dForceIdleEyeAnimation:nt,live2dAutoBlinkEnabled:rt,live2dForceAutoBlinkEnabled:it,lastUpdateTime:je}),l=re(yt,Ct);c.register(l.pre,`pre`),c.register(se(),`pre`),c.register(ce(),`post`),c.register(ye(V.expressions),`final`),c.register(oe(K),`final`),c.register(ge(()=>xe(Y.value.behindLuminance),()=>J.value?mt.value:0),`final`),c.register(ue(ee,M,{controller:ne,target:Rt}),`final`),c.register(l.layer,`final`),c.register(pe(ke,Ae),`final`),c.register(fe(T),`final`),c.register(le(N.sample),`final`);let u=a.update;a.update=function(e,t){return c.hookUpdate(e,t,u)},a.on(`motionStart`,(e,t)=>{vt.value={group:e,index:t}}),a.on(`motionFinish`,()=>{let e=localStorage.getItem(`selected-runtime-motion-group`),t=localStorage.getItem(`selected-runtime-motion-index`);e!==null&&t&&G.value&&(console.info(`Motion finished, restarting runtime motion:`,e,t),requestAnimationFrame(()=>{H.value={group:e,index:Number.parseInt(t)}}))}),i.setParameterValueById(`ParamAngleX`,W.value.angleX),i.setParameterValueById(`ParamAngleY`,W.value.angleY),i.setParameterValueById(`ParamAngleZ`,W.value.angleZ),i.setParameterValueById(`ParamEyeLOpen`,W.value.leftEyeOpen),i.setParameterValueById(`ParamEyeROpen`,W.value.rightEyeOpen),i.setParameterValueById(`ParamEyeSmile`,W.value.leftEyeSmile),i.setParameterValueById(`ParamBrowLX`,W.value.leftEyebrowLR),i.setParameterValueById(`ParamBrowRX`,W.value.rightEyebrowLR),i.setParameterValueById(`ParamBrowLY`,W.value.leftEyebrowY),i.setParameterValueById(`ParamBrowRY`,W.value.rightEyebrowY),i.setParameterValueById(`ParamBrowLAngle`,W.value.leftEyebrowAngle),i.setParameterValueById(`ParamBrowRAngle`,W.value.rightEyebrowAngle),i.setParameterValueById(`ParamBrowLForm`,W.value.leftEyebrowForm),i.setParameterValueById(`ParamBrowRForm`,W.value.rightEyebrowForm),i.setParameterValueById(`ParamMouthOpenY`,W.value.mouthOpen),i.setParameterValueById(`ParamMouthForm`,W.value.mouthForm),i.setParameterValueById(`ParamCheek`,W.value.cheek),i.setParameterValueById(`ParamBodyAngleX`,W.value.bodyAngleX),i.setParameterValueById(`ParamBodyAngleY`,W.value.bodyAngleY),i.setParameterValueById(`ParamBodyAngleZ`,W.value.bodyAngleZ),i.setParameterValueById(`ParamBreath`,W.value.breath),_t.value=r.eyeBlink,Q.value=a.expressionManager,K.value&&(a.expressionManager&&=null,r.eyeBlink&&=null),V.setModel(r),f(`modelLoaded`)}catch(t){if(A||e!==O.value)return;console.error(`[Live2D] Failed to load model:`,t),f(`error`,t instanceof Error?t:Error(String(t)))}finally{k.value=!1,p.value=`mounted`,Ot(R.value?.internalModel)}}function Ot(e){let t=e?.settings;t?(X.value=(t.expressions??[]).map(e=>({name:e.Name,fileName:e.File})),Z.value=async e=>{let n=t.resolveURL?.(e)??e,r=await fetch(n);if(!r.ok)throw Error(`Failed to fetch exp3 file: ${e} (${r.status})`);return r.text()},kt()):(X.value=[],Z.value=void 0)}function kt(){let e=Q.value;V.expressions.setExecutor(K.value?{activate:e=>(V.expressions.reset(),V.expressions.activate(e)),reset:()=>(V.expressions.reset(),!0)}:{activate:t=>e?.setExpression(t)??!1,reset:()=>(e?.resetExpression(),!!e)})}async function At(e,t){if(!R.value)return console.warn(`Cannot set motion: model not loaded`),!1;console.info(`Setting motion:`,e,`index:`,t);try{return await R.value.motion(e,t,We.FORCE),console.info(`Motion started successfully:`,e),!0}catch(t){return console.error(`Failed to start motion:`,e,t),!1}}let jt=_(),$=_(0);function Mt(){J.value&&Ne.value.update({environment:Y.value,subject:dt.value,mode:ft.value,strength:pt.value,options:ut.value})}function Nt(){let e=J.value?Y.value.exposure:0;if(z.value.alpha=bt*(1-St*e),!jt.value)return;let t=getComputedStyle(jt.value).backgroundColor;z.value.color=Number(Te(t).replace(`#`,`0x`))}function Pt(){if(!R.value)return;let e=[];J.value&&e.push(Ne.value),q.value&&e.push(z.value);let t=R.value.filters??[];t.length===e.length&&t.every((t,n)=>t===e[n])||(R.value.filters=e)}function Ft(){Mt(),Nt(),Pt()}r(O,async()=>await Et(),{immediate:!0}),r(Me,Ft,{immediate:!0}),r([R,Qe],Ft),r([q,J],Pt),r([J,ut,Y,ft,pt],Ft);function It(){Nt(),q.value?$.value=requestAnimationFrame(It):$.value=0}r([$e,q],([e,t])=>{e&&t?$.value=requestAnimationFrame(It):(cancelAnimationFrame($.value),$.value=0)},{immediate:!0}),r(H,e=>At(e.group,e.index)),r(we,e=>e?I.value?.stop():I.value?.start()),r(()=>W.value.angleX,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamAngleX`,e)}),r(()=>W.value.angleY,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamAngleY`,e)}),r(()=>W.value.angleZ,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamAngleZ`,e)}),r(()=>W.value.leftEyeOpen,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamEyeLOpen`,e)}),r(()=>W.value.rightEyeOpen,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamEyeROpen`,e)}),r(()=>W.value.mouthOpen,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamMouthOpenY`,e)}),r(()=>W.value.mouthForm,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamMouthForm`,e)}),r(()=>W.value.cheek,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamCheek`,e)}),r(()=>W.value.bodyAngleX,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBodyAngleX`,e)}),r(()=>W.value.bodyAngleY,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBodyAngleY`,e)}),r(()=>W.value.bodyAngleZ,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBodyAngleZ`,e)}),r(()=>W.value.breath,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBreath`,e)}),r(()=>W.value.leftEyebrowLR,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowLX`,e)}),r(()=>W.value.rightEyebrowLR,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowRX`,e)}),r(()=>W.value.leftEyebrowY,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowLY`,e)}),r(()=>W.value.rightEyebrowY,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowRY`,e)}),r(()=>W.value.leftEyebrowAngle,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowLAngle`,e)}),r(()=>W.value.rightEyebrowAngle,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowRAngle`,e)}),r(()=>W.value.leftEyebrowForm,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowLForm`,e)}),r(()=>W.value.rightEyebrowForm,e=>{R.value&&R.value.internalModel.coreModel.setParameterValueById(`ParamBrowRForm`,e)}),r(G,e=>{if(!e&&R.value){let e=R.value.internalModel;e?.motionManager&&e.motionManager.stopAllMotions()}}),r(K,e=>{if(!R.value)return;let t=R.value.internalModel,n=t.motionManager;e?(n.expressionManager&&=null,t.eyeBlink&&=null,Ot(t)):(n.expressionManager=Q.value,t.eyeBlink=_t.value,V.expressions.reset(),kt())});function Lt(){let e=R.value;if(!e)return;let t=Se({eyeTracking:l.eyeTracking,sourceActive:l.eyeFocusSourceActive,idleEyeFocus:l.live2dForceIdleEyeAnimation});t===`follow`?e.focus(L.value.x,L.value.y):t===`center`&&e.internalModel.focusController.focus(0,0)}r([R,L,et,tt,nt],Lt),r(D,e=>{e!==null&&ne.reset()});function Rt(){let e=R.value;if(!e||!l.focusBias||!l.eyeFocusSourceActive||D.value!==null)return;let t=e.internalModel,n=e.toModelPosition(new Pe(L.value.x,L.value.y));return ae(n,{width:t.originalWidth,height:t.originalHeight})}c(()=>{let e=Le(()=>yt.scheduleBeat());u(()=>e())}),c(async()=>{Ft()}),u(()=>{A=!0,Fe?.pause(),wt?.(),X.value=[],Z.value=void 0,R.value&&(R.value.filters=[]),Ne.value.destroy(),z.value.destroy(),ze()});function zt(e){let t=R.value;if(!t)return;let n=t.internalModel,r=n.coreModel,i=t.toModelPosition(new Pe(e.x,e.y));function a(e){let t=n.getDrawableBounds(e);return i.x<t.x||i.x>t.x+t.width||i.y<t.y||i.y>t.y+t.height?!1:de(i,n.getDrawableVertices(e),r.getDrawableVertexIndices(e))}let o=Object.values(n.hitAreas),s=new Set(o.map(e=>e.index)),c=ht.bounds(n),l=!!c&&i.x>=c.x&&i.x<=c.x+c.width&&i.y>=c.y&&i.y<=c.y+c.height,u=!1,d=r.getDrawableCount();for(let e=0;e<d&&!u;e+=1)s.has(e)||!r.getDrawableDynamicFlagIsVisible(e)||r.getDrawableOpacity(e)<=0||(u=a(e));let f=ie({hitAreaNames:o.filter(e=>a(e.index)).map(e=>e.name),insideHead:l,insideDrawable:u});if(f)return{region:f,side:Math.min(1,Math.max(-1,i.x/n.originalWidth*2-1))}}function Bt(e){R.value&&N.trigger(e,je.value)}function Vt(e){let t=R.value;if(!t)return;let n=_e(Object.keys(t.internalModel.motionManager.definitions),e);n&&t.motion(n,void 0,We.NORMAL)}function Ht(){return U.value}function Ut(){let e=R.value;if(!e)return;let t=e.internalModel;e.transform.updateLocalTransform();let n=ht.bounds(t);if(n)return ot(n,t.localTransform,e.transform.localTransform)}return t({setMotion:At,listMotionGroups:Ht,modelNormalizeParams:B,initialModelHeight:Oe,initialModelWidth:De,headAnchor:Ut,touchAt:zt,react:Bt,playTouchMotion:Vt}),(e,t)=>(m(),o(h,null,[(m(!0),o(h,null,s(X.value,e=>(m(),g(Ye,{key:e.name,name:e.name,"file-name":e.fileName,load:Z.value},null,8,[`name`,`file-name`,`load`]))),128)),a(`div`,{ref_key:`dropShadowColorComputer`,ref:jt,hidden:``,bg:`primary-400 dark:primary-500`},null,512),b(e.$slots,`default`)],64))}});export{U as a,H as i,Ze as n,Xe as r,Ct as t};
//# sourceMappingURL=live2d-r3IyRmAG.js.map
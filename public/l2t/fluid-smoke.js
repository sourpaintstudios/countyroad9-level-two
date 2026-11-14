/*!
 * SPS Fluid Smoke - standalone WebGL fluid overlay (Sour Paint Studios)
 * One file, no dependencies. A real-time Navier-Stokes fluid sim: finger drags stir
 * glowing colored smoke over whatever is underneath (your canvas / app).
 *
 * USAGE
 *   <script src="fluid-smoke.js"></script>
 *   SPSFluid.start();                       // creates the overlay canvas and begins
 *   SPSFluid.setColor(270, 1);              // hue 0-360, saturation 0-1 (call whenever the user picks a color)
 *   SPSFluid.setBG('clear');                // 'clear' (default, see-through) | 'black' | 'white' | 'gray'
 *   SPSFluid.stop();                        // hides and pauses
 *   SPSFluid.splat(x, y, dx, dy, hue);      // optional: push smoke from code (x,y in CSS px; dx,dy = velocity px)
 *   SPSFluid.setLevel(0..1, hueOrNull);     // optional: audio level; makes smoke burst by itself (feed from mic/analyser)
 *   SPSFluid.on()                           // true when running
 * Options: SPSFluid.start({z:2, ignore:'button,.panel'})  z = canvas z-index,
 *   ignore = CSS selector; touches that begin on matching elements do not stir the smoke.
 * The overlay canvas has pointer-events:none, so your app keeps receiving every touch.
 * Pointer events are listened to on window (capture), so no change to your own handlers.
 */
(function(){
var D=document,cv,gl,T,P={},vel,dye,dvg,crl,prs,on=false,raf=0,last=0,ptr={},idle=0,tt=0,ready=0,fail=0,W=1,H=1,aspect=1;
var noIdle=0,HUE=270,SAT=1,bgi=3,lvl=0,lvlHue=null,Z=2,IGN='button,input,select,textarea,a';
var BGS={black:[[0,0,0],.3],white:[[1,1,1],.3],gray:[[.48,.48,.5],.3],clear:[[0,0,0],0]};
var BGN='clear';
var VS='attribute vec2 aPosition;varying vec2 vUv,vL,vR,vT,vB;uniform vec2 texelSize;void main(){vUv=aPosition*.5+.5;vL=vUv-vec2(texelSize.x,0.);vR=vUv+vec2(texelSize.x,0.);vT=vUv+vec2(0.,texelSize.y);vB=vUv-vec2(0.,texelSize.y);gl_Position=vec4(aPosition,0.,1.);}';
var HD='precision highp float;varying vec2 vUv,vL,vR,vT,vB;';
var FS={
clear:'uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}',
splat:'uniform sampler2D uTarget;uniform float aspectRatio;uniform vec3 color;uniform vec2 point;uniform float radius;void main(){vec2 p=vUv-point;p.x*=aspectRatio;vec3 s=exp(-dot(p,p)/radius)*color;gl_FragColor=vec4(texture2D(uTarget,vUv).xyz+s,1.);}',
adv:'uniform sampler2D uVelocity;uniform sampler2D uSource;uniform vec2 texelSize;uniform float dt,dissipation;void main(){vec2 c=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;gl_FragColor=texture2D(uSource,c)/(1.+dissipation*dt);}',
div:'uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x,R=texture2D(uVelocity,vR).x,T=texture2D(uVelocity,vT).y,B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;gl_FragColor=vec4(.5*(R-L+T-B),0.,0.,1.);}',
curl:'uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y,R=texture2D(uVelocity,vR).y,T=texture2D(uVelocity,vT).x,B=texture2D(uVelocity,vB).x;gl_FragColor=vec4(.5*(R-L-T+B),0.,0.,1.);}',
vort:'uniform sampler2D uVelocity;uniform sampler2D uCurl;uniform float curl,dt;void main(){float L=texture2D(uCurl,vL).x,R=texture2D(uCurl,vR).x,T=texture2D(uCurl,vT).x,B=texture2D(uCurl,vB).x,C=texture2D(uCurl,vUv).x;vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+.0001;f*=curl*C;f.y*=-1.;vec2 v=texture2D(uVelocity,vUv).xy+f*dt;gl_FragColor=vec4(min(max(v,-1000.),1000.),0.,1.);}',
pres:'uniform sampler2D uPressure;uniform sampler2D uDivergence;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;float d=texture2D(uDivergence,vUv).x;gl_FragColor=vec4((L+R+B+T-d)*.25,0.,0.,1.);}',
grad:'uniform sampler2D uPressure;uniform sampler2D uVelocity;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;vec2 v=texture2D(uVelocity,vUv).xy-vec2(R-L,T-B);gl_FragColor=vec4(v,0.,1.);}',
disp:'uniform sampler2D uTexture;uniform vec3 bg;uniform float bgA;void main(){vec3 c=max(texture2D(uTexture,vUv).rgb,0.);float m=max(c.r,max(c.g,c.b));float a=min(1.,pow(m,.8)*.95);vec3 h=c/max(m,.0001);gl_FragColor=vec4(bg*bgA*(1.-a)+h*a,max(bgA,a));}'};
function prog(fs){var p=gl.createProgram(),a=gl.createShader(gl.VERTEX_SHADER),b=gl.createShader(gl.FRAGMENT_SHADER);
 gl.shaderSource(a,VS);gl.compileShader(a);gl.shaderSource(b,HD+fs);gl.compileShader(b);
 if(!gl.getShaderParameter(b,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(b));
 gl.attachShader(p,a);gl.attachShader(p,b);gl.bindAttribLocation(p,0,'aPosition');gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link');
 var u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(var i=0;i<n;i++){var nm=gl.getActiveUniform(p,i).name;u[nm]=gl.getUniformLocation(p,nm);}
 return{p:p,u:u};}
function use(p){gl.useProgram(p.p);return p.u;}
function tex(loc,t,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(loc,unit);}
function mkT(w,h,fl){var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,fl);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,fl);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texImage2D(gl.TEXTURE_2D,0,T.fmt,w,h,0,gl.RGBA,T.hf,null);
 var f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('fbo');
 gl.viewport(0,0,w,h);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
 return{t:t,f:f,w:w,h:h,tx:[1/w,1/h]};}
function mk2(w,h,fl){return{r:mkT(w,h,fl),w:mkT(w,h,fl),swap:function(){var x=this.r;this.r=this.w;this.w=x;}};}
function res(r){var a=W/H;if(a<1)a=1/a;var mn=Math.round(r),mx=Math.round(r*a);return W>H?{w:mx,h:mn}:{w:mn,h:mx};}
function build(){var s=res(128),d=res(512),fl=T.lin?gl.LINEAR:gl.NEAREST;
 vel=mk2(s.w,s.h,fl);dye=mk2(d.w,d.h,fl);dvg=mkT(s.w,s.h,gl.NEAREST);crl=mkT(s.w,s.h,gl.NEAREST);prs=mk2(s.w,s.h,gl.NEAREST);}
function size(){if(!cv)return;var dp=Math.min(1.5,window.devicePixelRatio||1);W=Math.max(2,innerWidth);H=Math.max(2,innerHeight);cv.width=Math.round(W*dp);cv.height=Math.round(H*dp);aspect=cv.width/cv.height;if(ready){try{build();}catch(e){fail=1;}}}

function hsv(h,s,v){h=((h%360)+360)%360/60;var i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);switch(i%6){case 0:return[v,t,p];case 1:return[q,v,p];case 2:return[p,v,t];case 3:return[p,q,v];case 4:return[t,p,v];default:return[v,p,q];}}
function col(h,k){var c=hsv(h,SAT,1);return[c[0]*.11*k,c[1]*.11*k,c[2]*.11*k];}
function blit(t){if(t){gl.viewport(0,0,t.w,t.h);gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);}else{gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);}
function splat(x,y,dx,dy,c){var u=use(P.splat),r=.0012;if(aspect>1)r*=aspect;
 tex(u.uTarget,vel.r.t,0);gl.uniform1f(u.aspectRatio,aspect);gl.uniform2f(u.point,x,y);gl.uniform3f(u.color,dx,dy,0);gl.uniform1f(u.radius,r);blit(vel.w);vel.swap();
 tex(u.uTarget,dye.r.t,0);gl.uniform3f(u.color,c[0],c[1],c[2]);blit(dye.w);dye.swap();}
function step(dt){var u;gl.disable(gl.BLEND);
 u=use(P.curl);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uVelocity,vel.r.t,0);blit(crl);
 u=use(P.vort);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uVelocity,vel.r.t,0);tex(u.uCurl,crl.t,1);gl.uniform1f(u.curl,30);gl.uniform1f(u.dt,dt);blit(vel.w);vel.swap();
 u=use(P.div);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uVelocity,vel.r.t,0);blit(dvg);
 u=use(P.clear);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uTexture,prs.r.t,0);gl.uniform1f(u.value,.8);blit(prs.w);prs.swap();
 u=use(P.pres);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uDivergence,dvg.t,0);for(var i=0;i<20;i++){tex(u.uPressure,prs.r.t,1);blit(prs.w);prs.swap();}
 u=use(P.grad);gl.uniform2fv(u.texelSize,vel.r.tx);tex(u.uPressure,prs.r.t,0);tex(u.uVelocity,vel.r.t,1);blit(vel.w);vel.swap();
 u=use(P.adv);gl.uniform2fv(u.texelSize,vel.r.tx);gl.uniform1f(u.dt,dt);tex(u.uVelocity,vel.r.t,0);tex(u.uSource,vel.r.t,1);gl.uniform1f(u.dissipation,.2);blit(vel.w);vel.swap();
 tex(u.uVelocity,vel.r.t,0);tex(u.uSource,dye.r.t,1);gl.uniform1f(u.dissipation,2.8);blit(dye.w);dye.swap();
 u=use(P.disp);gl.uniform2fv(u.texelSize,vel.r.tx);var bg=BGS[BGN];gl.uniform3f(u.bg,bg[0][0],bg[0][1],bg[0][2]);gl.uniform1f(u.bgA,bg[1]);tex(u.uTexture,dye.r.t,0);blit(null);}

function init(){
 cv=D.createElement('canvas');cv.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:'+Z+';pointer-events:none';D.body.appendChild(cv);
 var o={alpha:true,premultipliedAlpha:true,depth:false,stencil:false,antialias:false,preserveDrawingBuffer:false};
 gl=cv.getContext('webgl2',o);
 if(gl){gl.getExtension('EXT_color_buffer_float');gl.getExtension('EXT_color_buffer_half_float');T={hf:gl.HALF_FLOAT,fmt:gl.RGBA16F,lin:true};}
 else{gl=cv.getContext('webgl',o)||cv.getContext('experimental-webgl',o);if(!gl)throw new Error('nogl');var e=gl.getExtension('OES_texture_half_float');if(!e)throw new Error('nohf');var l=gl.getExtension('OES_texture_half_float_linear');gl.getExtension('EXT_color_buffer_half_float');T={hf:e.HALF_FLOAT_OES,fmt:gl.RGBA,lin:!!l};}
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,-1,1,1,1,1,-1]),gl.STATIC_DRAW);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,0,2,3]),gl.STATIC_DRAW);
 gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(0);
 for(var k in FS)P[k]=prog(FS[k]);
 size();build();ready=1;addEventListener('resize',size);
 function ok(e){var t=e.target;return !(t&&t.closest&&IGN&&t.closest(IGN));}
 function pd(e){if(!on||!ok(e))return;ptr[e.pointerId]={x:e.clientX,y:e.clientY,o:(Math.random()-.5)*50,h:HUE};var p=ptr[e.pointerId];splat(p.x/W,1-p.y/H,(Math.random()-.5)*400,(Math.random()-.5)*400,col(p.h,1.6));}
 function pm(e){var p=ptr[e.pointerId];if(!on||!p)return;var dx=(e.clientX-p.x)/W,dy=-(e.clientY-p.y)/H;if(aspect<1)dx*=aspect;else dy/=aspect;p.o=Math.max(-35,Math.min(35,p.o+(Math.random()-.5)*8));p.h=HUE+p.o;splat(e.clientX/W,1-e.clientY/H,dx*6000,dy*6000,col(p.h,1));p.x=e.clientX;p.y=e.clientY;}
 function pu(e){delete ptr[e.pointerId];}
 addEventListener('pointerdown',pd,true);addEventListener('pointermove',pm,true);addEventListener('pointerup',pu,true);addEventListener('pointercancel',pu,true);
 if(!noIdle)for(var i=0;i<6;i++)splat(Math.random(),Math.random(),(Math.random()-.5)*1500,(Math.random()-.5)*1500,col(HUE+(i-2.5)*14,2));
}
function frame(now){if(!on)return;raf=requestAnimationFrame(frame);var dt=Math.min((now-last)/1000,.0166667);last=now;if(!(dt>0))dt=.0166667;tt+=dt;
 var ids=Object.keys(ptr),i;
 for(i=0;i<ids.length;i++){var p=ptr[ids[i]];splat(p.x/W,1-p.y/H,(Math.random()-.5)*30,(Math.random()-.5)*30,col(p.h,.35));}
 if(lvl>.1&&Math.random()<.4+lvl*.6){var n=1+Math.floor(lvl*3),hh=lvlHue==null?HUE:lvlHue;for(i=0;i<n;i++)splat(Math.random(),Math.random(),(Math.random()-.5)*2200*lvl,(Math.random()-.5)*2200*lvl,col(hh+(Math.random()-.5)*60,1.5+3*lvl));}
 idle-=dt;if(!noIdle&&idle<=0&&lvl<.1&&!ids.length){idle=3.5+Math.random()*3;splat(Math.random(),Math.random(),(Math.random()-.5)*900,(Math.random()-.5)*900,col(HUE+(Math.random()-.5)*60,1.2));}
 step(dt);}
window.SPSFluid={
 start:function(o){if(on||fail)return;o=o||{};if(o.idle===false)noIdle=1;if(o.z!=null)Z=o.z;if(typeof o.ignore==='string')IGN=o.ignore;
  try{if(!cv)init();}catch(e){fail=1;console.warn('SPSFluid',e);try{if(cv)cv.remove();}catch(_){}return;}
  cv.style.zIndex=Z;on=true;cv.style.display='';ptr={};last=performance.now();raf=requestAnimationFrame(frame);},
 stop:function(){on=false;cancelAnimationFrame(raf);if(cv)cv.style.display='none';ptr={};},
 on:function(){return on;},
 setColor:function(h,s){HUE=h;if(s!=null)SAT=Math.max(.2,Math.min(1,s));},
 setBG:function(n){if(BGS[n]){BGN=n;}},
 setLevel:function(l,h){lvl=Math.max(0,Math.min(1,l||0));lvlHue=(h==null)?null:h;},
 splat:function(x,y,dx,dy,h,k){if(!ready)return;var d=[dx/W*6000,-dy/H*6000];if(aspect<1)d[0]*=aspect;else d[1]/=aspect;splat(x/W,1-y/H,d[0],d[1],col(h==null?HUE:h,k==null?1.4:k));}
};
})();

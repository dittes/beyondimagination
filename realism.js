import * as T from 'three';
// Small-scale surface detail, contact shading, and sun-projected silhouettes.
export function addRealism(objects, renderer, water, ring){
 const noise=document.createElement('canvas');noise.width=noise.height=256;
 const ctx=noise.getContext('2d'),data=ctx.createImageData(256,256);
 let seed=73;for(let i=0;i<data.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const n=118+(seed/4294967296)*20;data.data[i]=data.data[i+1]=data.data[i+2]=n;data.data[i+3]=255;}ctx.putImageData(data,0,0);
 const texture=new T.CanvasTexture(noise);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(5,5);
 const shadowScene=new T.Scene(),shadowTarget=new T.WebGLRenderTarget(512,512,{depthBuffer:false});
 water.uniforms.shadowMap={value:shadowTarget.texture};
 const shadowMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,side:T.DoubleSide,vertexShader:`void main(){vec4 p=modelMatrix*vec4(position,1.);float depth=p.z+1.35;p.xy+=vec2(.423,.327)/.845*depth;p.z=-.96;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:'void main(){gl_FragColor=vec4(1.);}' });
 for(const o of objects){
  o.contact={value:new T.Vector3(0,0,0)};o.surface={height:0,dx:0,dy:0};o.lastWake=0;o.previousPosition=null;
  o.g.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=mesh.material.clone();const m=mesh.material;m.bumpMap=texture;m.bumpScale=o.kind==='duck'?.003:.007;
   m.onBeforeCompile=shader=>{shader.uniforms.contact=o.contact;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 wetPosition;').replace('#include <project_vertex>','#include <project_vertex>\nwetPosition=(modelMatrix*vec4(transformed,1.)).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 contact;varying vec3 wetPosition;').replace('#include <opaque_fragment>',`float contactDepth=wetPosition.z-contact.z;
float wet=1.-smoothstep(-.018,.015,contactDepth);
outgoingLight=mix(outgoingLight,outgoingLight*vec3(.70,.88,.91),wet*.65);
float meniscus=exp(-pow(contactDepth/.010,2.));
outgoingLight+=vec3(.20,.31,.29)*meniscus*.36;
#include <opaque_fragment>`);};m.customProgramCacheKey=()=> 'toy-waterline-v1';
  });
  const shadow=o.g.clone(true);shadow.traverse(m=>{if(m.isMesh)m.material=shadowMaterial;if(m.isLine)m.visible=false;});shadowScene.add(shadow);o.silhouette=shadow;
 }
 // Low ridges in inflated vinyl, concentrated around the tube's welds.
 const pos=ring.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),a=Math.atan2(y,x),r=Math.hypot(x,y);pos.setZ(i,z+.0035*Math.sin(a*67+Math.sin(a*7))*Math.exp(-Math.pow((r-.79)/.22,2)));}pos.needsUpdate=true;ring.geometry.computeVertexNormals();
 const u=objects.find(o=>o.kind==='unicorn').g;
 for(const radius of [1.057,.522]){const seam=new T.Mesh(new T.TorusGeometry(radius,.0035,5,160),new T.MeshPhysicalMaterial({color:0xe4e4d8,roughness:.48}));seam.scale.y=1.15;seam.position.z=.015;u.add(seam);}
 return {resize(w,h){shadowTarget.setSize(Math.min(1024,w),Math.min(1024,h));},update(dt,time){
  objects.forEach(o=>{o.contact.value.set(o.g.position.x,o.g.position.y,o.surface.height);o.silhouette.position.copy(o.g.position);o.silhouette.quaternion.copy(o.g.quaternion);o.silhouette.scale.copy(o.g.scale);if(o.kind==='ball')o.silhouette.children[0].quaternion.copy(o.g.children[0].quaternion);
   const current=o.g.position;const drift=o.previousPosition?{x:(current.x-o.previousPosition.x)/Math.max(dt,.001),y:(current.y-o.previousPosition.y)/Math.max(dt,.001)}:{x:0,y:0};o.previousPosition=current.clone();const speed=Math.hypot(drift.x,drift.y);
   if(time-o.lastWake>.20&&speed>.015){o.lastWake=time;const vx=drift.x,vy=drift.y,len=Math.hypot(vx,vy),r=o.r*o.g.scale.x;
    const bx=o.g.position.x-vx/len*r*.75,by=o.g.position.y-vy/len*r*.75;
    water.sim.disturb(bx,-by,Math.max(.07,r*.28),Math.min(.006,.00065+speed*.009));
   }
  });},render(camera){renderer.setRenderTarget(shadowTarget);renderer.setClearColor(0,0);renderer.clear();renderer.render(shadowScene,camera);renderer.setRenderTarget(null);}};
}

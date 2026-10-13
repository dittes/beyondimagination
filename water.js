// Water simulation adapted from the user-supplied tmpl CodePen reference.
import * as THREE from 'three';
const waveCommon = /* glsl */`
uniform sampler2D heightMap;
uniform float time;
uniform vec2 poolSize;
const vec2 texel = vec2(1.0/256.0);
float ambient(vec2 p) {
  // A broad directional spectrum avoids two dominant crossing wave trains.
  p+=0.12*vec2(sin(p.y*.81+p.x*.47-time*.23),sin(p.x*.67-p.y*.92+time*.16));
  float shelter=0.69+0.22*sin(p.x*.61+p.y*.37+0.5)*sin(p.y*.71-p.x*.23);
  return shelter*(0.010*sin(dot(p,vec2(3.7,2.1))-time*1.82)
       + 0.007*sin(dot(p,vec2(-5.3,6.1))-time*2.47+0.7)
       + 0.0042*sin(dot(p,vec2(10.1,2.3))-time*3.14+1.3)
       + 0.0048*sin(dot(p,vec2(-7.2,5.9))-time*2.91+2.4)
       + 0.0035*sin(dot(p,vec2(3.6,14.2))-time*3.86+3.8)
       + 0.0034*sin(dot(p,vec2(14.4,11.7))-time*4.23+1.8)
       + 0.0042*sin(dot(p,vec2(-13.2,8.4))-time*3.95+0.4)
       + 0.0028*sin(dot(p,vec2(21.8,9.2))-time*4.80+4.1)
       + 0.0016*sin(dot(p,vec2(19.7,-24.1))-time*5.52+2.6)
       + 0.0010*sin(dot(p,vec2(-29.4,-12.7))-time*5.64+0.9));
}
float heightAt(vec2 uv) {
  vec2 p=(uv-0.5)*poolSize;
  return texture2D(heightMap,clamp(uv,texel*0.5,1.0-texel*0.5)).r+ambient(p);
}
vec3 normalAt(vec2 uv) {
  float dx=(heightAt(uv+vec2(texel.x,0.0))-heightAt(uv-vec2(texel.x,0.0)))/(2.0*poolSize.x*texel.x);
  float dz=(heightAt(uv+vec2(0.0,texel.y))-heightAt(uv-vec2(0.0,texel.y)))/(2.0*poolSize.y*texel.y);
  return normalize(vec3(-dx,1.0,-dz));
}
`;
const waterVertex=/* glsl */`
${waveCommon}
varying vec3 vWorld;
varying vec2 vUv;
void main(){
 vUv=uv;
 vec3 p=vec3(position.x,heightAt(vec2(uv.x,1.0-uv.y)),-position.y);
 vWorld=p;
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
}
`;
const waterFragment=/* glsl */`
${waveCommon}
uniform sampler2D environmentMap;
uniform sampler2D causticsMap;
uniform float hasEnvironment;
uniform sampler2D floorOverlay;
uniform sampler2D shadowMap;
uniform float eyeHeight;
varying vec3 vWorld;
varying vec2 vUv;
const vec3 sun=vec3(-0.423,0.845,0.327);
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 environment(vec3 d) {
 vec2 uv=vec2(atan(d.z,d.x)*0.15915494+0.5,asin(clamp(d.y,-1.0,1.0))*0.31830989+0.5);
 vec3 sky=mix(vec3(0.5,0.64,0.71),vec3(0.28,0.48,0.75),max(d.y,0.0));
 return mix(sky,texture2D(environmentMap,uv).rgb*0.75,hasEnvironment);
}
vec3 tiles(vec2 p, float wall){
 vec2 q=p/0.115;
 vec2 cell=floor(q);
 float r=hash(cell);
 vec2 f=fract(q);
 vec2 w=fwidth(q)*1.1;
 vec2 edge=smoothstep(vec2(0.017)-w,vec2(0.017)+w,min(f,1.0-f));
 float joint=1.0-edge.x*edge.y;
 vec3 tile=mix(vec3(0.26,0.50,0.47),vec3(0.38,0.61,0.57),r);
 tile*=1.0+0.018*sin(p.x*412.0)*sin(p.y*373.0);
 tile=mix(tile,vec3(0.22,0.39,0.36),joint*0.48);
 return tile;
}
vec3 basin(vec3 origin,vec3 ray){
 float tf=(-1.35-origin.y)/ray.y;
 vec2 side=(sign(ray.xz)*(poolSize*.5)-origin.xz)/ray.xz;
 float t=min(tf,min(side.x,side.y));
 vec3 p=origin+ray*t;
 vec3 n=vec3(0.0,1.0,0.0);
 vec2 tileUv=p.xz;
 float wall=0.0;
 if(side.x<tf && side.x<side.y){n=vec3(-sign(ray.x),0.0,0.0);tileUv=p.zy;wall=1.0;}
 else if(side.y<tf){n=vec3(0.0,0.0,-sign(ray.z));tileUv=p.xy;wall=1.0;}
 vec3 base=tiles(tileUv,wall);
 float depth=-p.y;
 vec2 surface=p.xz+sun.xz/sun.y*depth;
 float shadow=smoothstep(-0.09,0.08,poolSize.x*.5-abs(surface.x))*smoothstep(-0.09,0.08,poolSize.y*.5-abs(surface.y));
 vec2 cuv=p.xz/poolSize+0.5;
 float caustic=texture2D(causticsMap,clamp(cuv,0.001,0.999)).r;
 if(wall>0.5){
  vec2 c=tileUv*7.0;
  float f=sin(c.x+sin(c.y*1.7+time*.61))+sin(c.y+sin(c.x*1.31-time*.49));
  caustic=0.6+0.75*pow(max(0.0,1.0-abs(f)),7.0);
 }
 // Compress caustic contrast around its average, retaining the basin depth.
 caustic=0.66+(caustic-0.66)*0.38;
 float ao=0.79+0.21*smoothstep(0.0,0.3,min(poolSize.x*.5-abs(p.x),poolSize.y*.5-abs(p.z)));
 float diffuse=max(dot(n,sun),0.0);
 vec3 col=base*(0.29+shadow*(0.38+caustic*0.57)*diffuse)*ao;
 if(wall<0.5){
 vec4 overlay=texture2D(floorOverlay,vec2(p.x/poolSize.x+.5,.5-p.z/poolSize.y));
 col=mix(col,overlay.rgb*(.65+caustic*.20),overlay.a);
 vec2 suv=vec2(p.x/poolSize.x+.5,.5-p.z/poolSize.y);float shade=0.;
 for(int ix=-1;ix<=1;ix++)for(int iy=-1;iy<=1;iy++){shade+=texture2D(shadowMap,suv+vec2(float(ix),float(iy))*.014/poolSize).a/9.;}
 col*=1.-shade*.30;
 }
 // A submerged perimeter band and the very slight staining at the waterline.
 if(wall>0.5){col*=1.0-0.12*exp(-depth*38.0);}
 vec3 absorption=exp(-vec3(0.34,0.075,0.032)*t);
 col=col*absorption+vec3(0.025,0.25,0.24)*(1.0-absorption)*0.25;
 return col;
}
void main(){
 // PlaneGeometry's v axis points toward negative world z.
 vec2 uv=vec2(vUv.x,1.0-vUv.y);
 vec3 normal=normalAt(uv);
 vec3 eye=normalize(vec3(-vWorld.x,eyeHeight,-vWorld.z));
 vec3 refracted=refract(-eye,normal,1.0/1.333);
 vec3 transmitted=basin(vWorld,refracted);
 vec3 reflected=reflect(-eye,normal);
 vec3 reflection=environment(reflected);
 float fresnel=0.02037+0.97963*pow(1.0-max(dot(normal,eye),0.0),5.0);
 vec3 color=mix(transmitted,reflection,fresnel);
 vec3 halfway=normalize(eye+sun);
 float highlight=pow(max(dot(normal,halfway),0.0),950.0);
 color+=vec3(1.0,0.94,0.79)*highlight*1.8;
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
const causticsVertex=/* glsl */`
${waveCommon}
varying vec3 oldPos;
varying vec3 newPos;
void main(){
 vec2 coord=vec2(uv.x,1.0-uv.y);
 vec3 p=vec3(position.x,heightAt(coord),-position.y);
 vec3 light=normalize(vec3(0.423,-0.845,-0.327));
 vec3 ray=refract(light,normalAt(coord),1.0/1.333);
 vec3 flatRay=refract(light,vec3(0.0,1.0,0.0),1.0/1.333);
 oldPos=p+flatRay*((-1.35-p.y)/flatRay.y);
 newPos=p+ray*((-1.35-p.y)/ray.y);
 gl_Position=vec4(newPos.x/(poolSize.x*.5),newPos.z/(poolSize.y*.5),0.0,1.0);
}
`;
const causticsFragment=/* glsl */`
varying vec3 oldPos;
varying vec3 newPos;
void main(){
 float oldArea=length(cross(dFdx(oldPos),dFdy(oldPos)));
 float newArea=length(cross(dFdx(newPos),dFdy(newPos)));
 float intensity=clamp(oldArea/max(newArea,0.0000001),0.0,8.0)*0.66;
 gl_FragColor=vec4(vec3(intensity),1.0);
}
`;
const simulationFragment=/* glsl */`
uniform sampler2D state;
uniform vec4 impulses[16];
uniform int impulseCount;
uniform float delta;
uniform vec2 poolSize;
varying vec2 vUv;
void main(){
 vec2 dx=vec2(1.0/256.0,0.0),dy=dx.yx;
 vec2 s=texture2D(state,vUv).rg;
 float lapX=texture2D(state,vUv+dx).r+texture2D(state,vUv-dx).r-2.0*s.r;
 float lapZ=texture2D(state,vUv+dy).r+texture2D(state,vUv-dy).r-2.0*s.r;
 s.g+=(lapX*65536.0/(poolSize.x*poolSize.x)+lapZ*65536.0/(poolSize.y*poolSize.y))*1.21*delta;
 s.g*=exp(-0.64*delta);
 s.r+=s.g*delta;
 for(int i=0;i<16;i++){
  if(i>=impulseCount)break;
  vec2 d=(vUv-impulses[i].xy)*poolSize;
  float q=dot(d,d)/(impulses[i].z*impulses[i].z);
  s.r+=impulses[i].w*(1.0-q)*exp(-q);
 }
 gl_FragColor=vec4(clamp(s.r,-0.3,0.3),s.g,0.0,1.0);
}
`;


// A fixed-step 2D wave equation, with a no-flux boundary at the pool walls.
// Heights are metres; velocities are metres/second. dx != dz is accounted for.
class WaterSimulation {
  constructor(renderer, size) {
    this.size=size;
    this.renderer=renderer;
    const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false};
    this.a=new THREE.WebGLRenderTarget(256,256,options);
    this.b=this.a.clone();
    this.scene=new THREE.Scene();
    this.camera=new THREE.Camera();
    this.pending=[];
    this.accumulator=0;
    this.steps=0;
    this.uniforms={poolSize:{value:size},state:{value:this.a.texture},delta:{value:1/120},impulseCount:{value:0},impulses:{value:Array.from({length:16},()=>new THREE.Vector4())}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:simulationFragment,depthTest:false,depthWrite:false});
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.reset();
  }
  get texture(){return this.a.texture;}
  disturb(x,z,radius,strength){
    if(Math.abs(x)>this.size.x*.5||Math.abs(z)>this.size.y*.5)return;
    if(this.pending.length<64)this.pending.push(new THREE.Vector4(x/this.size.x+.5,z/this.size.y+.5,radius,strength));
  }
  reset(){
    const old=this.renderer.getRenderTarget();
    const oldColor=this.renderer.getClearColor(new THREE.Color());
    this.renderer.setClearColor(0,0);
    for(const t of [this.a,this.b]){this.renderer.setRenderTarget(t);this.renderer.clear();}
    this.renderer.setRenderTarget(old);this.renderer.setClearColor(oldColor,1);
    this.pending.length=0;this.accumulator=0;
  }
  update(dt){
    this.accumulator+=Math.min(dt,1/20);
    while(this.accumulator>=1/120){
      this.uniforms.state.value=this.a.texture;
      const count=Math.min(this.pending.length,16);
      this.uniforms.impulseCount.value=count;
      for(let i=0;i<count;i++)this.uniforms.impulses.value[i].copy(this.pending.shift());
      this.renderer.setRenderTarget(this.b);
      this.renderer.render(this.scene,this.camera);
      [this.a,this.b]=[this.b,this.a];
      this.accumulator-=1/120;this.steps++;
    }
    this.renderer.setRenderTarget(null);
  }
}


export class PoolWater {
 constructor(renderer, overlay, sky){
  this.renderer=renderer;
  this.size=new THREE.Vector2(16,10);
  this.sim=new WaterSimulation(renderer,this.size);
  this.uniforms={poolSize:{value:this.size},heightMap:{value:this.sim.texture},time:{value:0},environmentMap:{value:sky},hasEnvironment:{value:1},causticsMap:{value:null},floorOverlay:{value:overlay},eyeHeight:{value:12}};
  this.scene=new THREE.Scene();this.camera=new THREE.Camera();
  const vertex=`varying vec3 vWorld;varying vec2 vUv;uniform vec2 poolSize;void main(){vUv=uv;vWorld=vec3(position.x*poolSize.x*.5,0.,-position.y*poolSize.y*.5);gl_Position=vec4(position.xy,0.,1.);}`;
  this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:waterFragment,depthTest:false,depthWrite:false})));
  this.causticsTarget=new THREE.WebGLRenderTarget(1024,1024,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:true});
  this.uniforms.causticsMap.value=this.causticsTarget.texture;
  this.causticsScene=new THREE.Scene();
  this.caustics=new THREE.Mesh(new THREE.PlaneGeometry(16,10,256,256),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:causticsVertex,fragmentShader:causticsFragment,depthTest:false,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,transparent:true}));
  this.caustics.frustumCulled=false;this.causticsScene.add(this.caustics);
  // Read only four GPU samples, at 30 Hz, to couple buoyancy to the same height field.
  this.probes=Array.from({length:4},()=>new THREE.Vector2());this.probePixels=new Float32Array(16);this.probeTime=-1;
  this.probeTarget=new THREE.WebGLRenderTarget(4,1,{type:THREE.FloatType,depthBuffer:false});
  this.probeScene=new THREE.Scene();
  this.probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{...this.uniforms,probes:{value:this.probes}},depthTest:false,depthWrite:false,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:waveCommon+`uniform vec2 probes[4];void main(){int i=int(gl_FragCoord.x);vec2 uv=probes[i]/poolSize+.5;float e=.04;float h=heightAt(uv);float dx=(heightAt(uv+vec2(e/poolSize.x,0.))-heightAt(uv-vec2(e/poolSize.x,0.)))/(2.*e);float dy=-(heightAt(uv+vec2(0.,e/poolSize.y))-heightAt(uv-vec2(0.,e/poolSize.y)))/(2.*e);gl_FragColor=vec4(h,dx,dy,1.);}`})));

 }
 resize(w,h){this.size.set(w,h);this.uniforms.eyeHeight.value=Math.max(w,h)*.85;this.caustics.geometry.dispose();this.caustics.geometry=new THREE.PlaneGeometry(w,h,256,256);this.sim.reset();}
 disturb(x,y,strength){this.sim.disturb(x,-y,strength>.1?.32:.18,strength>.1?-.18:.016);}
 update(dt,time){this.sim.update(dt);this.uniforms.heightMap.value=this.sim.texture;this.uniforms.time.value=time;this.renderer.setRenderTarget(this.causticsTarget);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(this.causticsScene,this.camera);this.renderer.setRenderTarget(null);}
 sample(objects,time){if(time-this.probeTime<1/30)return;this.probeTime=time;objects.forEach((o,i)=>this.probes[i].set(o.g.position.x,-o.g.position.y));this.renderer.setRenderTarget(this.probeTarget);this.renderer.render(this.probeScene,this.camera);this.renderer.readRenderTargetPixels(this.probeTarget,0,0,4,1,this.probePixels);this.renderer.setRenderTarget(null);objects.forEach((o,i)=>{const n=i*4;o.surface.height=this.probePixels[n];o.surface.dx=this.probePixels[n+1];o.surface.dy=this.probePixels[n+2];});}
 render(){this.renderer.render(this.scene,this.camera);}
}

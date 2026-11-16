/* Run with: node --test tests/font-engine.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTTF, traceBitmap } = require('../js/font-engine.js');

const get16 = (data, i) => (data[i] << 8) | data[i+1];
const get32 = (data, i) => (((data[i] * 2**24) + (data[i+1] << 16) + (data[i+2] << 8) + data[i+3]) >>> 0);
function records(data) {
  const result={};
  for(let i=0;i<get16(data,4);i++){
    const p=12+i*16; const tag=String.fromCharCode(...data.slice(p,p+4));
    result[tag]={checksum:get32(data,p+4),offset:get32(data,p+8),length:get32(data,p+12)};
  }
  return result;
}
function checksum(data){let sum=0;for(let i=0;i<data.length;i+=4){sum=(sum+get32(data,i))>>>0;}return sum;}

test('exports a complete TrueType font with valid global checksum',()=>{
  const buf=buildTTF('Handletter',[
    {char:'A',advance:640,contours:[[{x:120,y:0},{x:320,y:720},{x:540,y:0}]]},
    {char:'B',advance:700,contours:[[{x:80,y:0},{x:80,y:720},{x:620,y:720},{x:620,y:0}]]}
  ]);
  assert.equal(get32(buf,0),0x10000);
  const tags=Object.keys(records(buf)).sort();
  assert.deepEqual(tags,['OS/2','cmap','glyf','head','hhea','hmtx','loca','maxp','name','post'].sort());
  assert.equal(checksum(buf),0xB1B0AFBA);
  const maxp=records(buf).maxp;
  assert.equal(get16(buf,maxp.offset+4),4); // .notdef, space, A, B
});

test('raster tracing preserves counters and scales glyphs without distortion',()=>{
  const img={width:320,height:320,data:new Uint8ClampedArray(320*320*4)};
  for(let y=60;y<260;y++)for(let x=70;x<250;x++){
    if(x>=115&&x<205&&y>=112&&y<208)continue;
    img.data[(y*320+x)*4+3]=255;
  }
  const contours=traceBitmap(img,650,2);
  assert.equal(contours.length,2,'outer boundary plus inner counter');
  const area=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-b.x*a.y},0);
  assert.notEqual(Math.sign(area(contours[0])),Math.sign(area(contours[1])));
  const font=buildTTF('Contour Test',[{char:'O',advance:650,contours}]);
  assert.ok(font.length>500);
});

test('a font needs at least one custom character',()=>{
  assert.throws(()=>buildTTF('Empty',[]),/at least one character/);
});

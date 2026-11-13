// Localhost-only, idempotent opening stock through authenticated API.
// Never directly changes inventory or stock_movements tables.
const {pool,assertDemoGuard,readSecret}=require('./f00-demo-db.cjs');
const BASE='http://localhost:5000';
const email=(process.env.IMS_F00_MANAGER_EMAIL||'').trim().toLowerCase();
const stock=[
 ['FRU-BAN-BCH','SHP-SOW','50'],
 ['DRY-ACE-10','WH-SOW','212'],
 ['DRY-ACE-10','SHP-MID','8'],
 ['CAN-KOO-410','WH-SOW','276'],
 ['DAI-CLV-2L','WH-SOW','48'],
 ['BAK-ALB-700','SHP-SOW','30'],
];
const reason='F00 Stage 2C opening balance';
const note='F00_STAGE2C_OPENING_API';
async function http(path,opts={},cookie=''){
 const r=await fetch(BASE+path,{...opts,headers:{Accept:'application/json',...(opts.body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...opts.headers}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(`${path}: HTTP ${r.status} ${data.error||'request failed'}`);
 return {data,headers:r.headers};
}
async function pagedProducts(cookie){const all=[];for(let page=1;page<=20;page++){
 const {data}=await http(`/api/products?status=active&page=${page}&pageSize=100`,{},cookie);
 if(!Array.isArray(data.items))throw Error('Unexpected products response: expected items array');
 all.push(...data.items);if(data.items.length<100)return all;
 }throw Error('Product pagination safety limit reached');}
(async()=>{
 if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Set IMS_F00_MANAGER_EMAIL to the test Manager account email.');
 const password=readSecret();const db=pool();
 try{const client=await db.connect();try{
  await assertDemoGuard(client);
  const check=await client.query(`SELECT r.name FROM public.users u JOIN public.roles r ON r.role_id=u.role_id WHERE lower(u.email)=$1 AND u.status='active'`,[email]);
  if(check.rows[0]?.name!=='Manager')throw Error('Manager account not present in marked test DB');
 }finally{client.release();}}finally{await db.end();}
 const login=await http('/api/custom-auth/login',{method:'POST',body:JSON.stringify({email,password})});
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 if(!cookie.startsWith('ims_custom_session='))throw Error('Login did not return custom session cookie');
 const products=await pagedProducts(cookie);
 const locations=(await http('/api/locations',{},cookie)).data.items;
 if(!Array.isArray(locations))throw Error('Unexpected locations response');
 for(const [sku,code,quantity] of stock){
  const p=products.find(x=>x.sku===sku),l=locations.find(x=>x.code===code);
  if(!p||!l)throw Error(`Missing seeded product or location: ${sku} @ ${code}`);
  const sp=new URLSearchParams({product_id:p.product_id,location_id:l.location_id,page:'1',pageSize:'1'});
  const {data:history}=await http(`/api/stock-movements?${sp}`,{},cookie);
  if(typeof history.total!=='number')throw Error('History API returned invalid pagination');
  if(history.total!==0){console.log(`SKIP ${sku} @ ${code}: already has ${history.total} movement(s); no opening added.`);continue;}
  const result=await http('/api/inventory/adjustments',{method:'POST',body:JSON.stringify({product_id:p.product_id,location_id:l.location_id,direction:'increase',quantity,reason,notes:note})},cookie);
  if(!result.data.movement?.movement_id)throw Error(`Unexpected adjustment response for ${sku}`);
  console.log(`POSTED ${sku} @ ${code}: +${quantity}; movement ${result.data.movement.movement_id}`);
 }
 console.log('Completed. Verify inventory balances and movement history with SQL verification.');
})().catch(e=>{console.error('OPENING STOCK FAILED:',e.message);process.exitCode=1;});

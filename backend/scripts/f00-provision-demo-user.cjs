// Provision ONE disposable-project demo user with existing Argon2id password library.
// Input: --email --first --last --role ; password via stdin only.
const argon2=require('argon2');
const {pool,assertDemoGuard,readSecret}=require('./f00-demo-db.cjs');
function args(){
 const a={};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i],v=process.argv[i+1];if(!['--email','--first','--last','--role'].includes(k)||!v)throw Error('Expected --email --first --last --role.');a[k.slice(2)]=v;}
 if(Object.keys(a).length!==4)throw Error('Required: --email, --first, --last, --role');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)||a.email.length>254)throw Error('Invalid email');
 if(a.email.toLowerCase()!==a.email)throw Error('Use lowercase email');
 if(!['Manager','Inventory Staff','Viewer'].includes(a.role))throw Error('Unrecognized role');
 if(!a.first.trim()||!a.last.trim()||a.first.length>100||a.last.length>100)throw Error('Invalid first/last name');
 return a;
}
(async()=>{
 const a=args();const password=readSecret();const db=pool();
 try{
  const client=await db.connect();
  try{
   await assertDemoGuard(client);
   // Prevent needless rehashing and never override existing credentials or role.
   const exists=await client.query('SELECT user_id FROM public.users WHERE lower(email)=lower($1) LIMIT 1',[a.email]);
   if(exists.rowCount){console.log(`SKIP: ${a.email} already exists; credentials/role unchanged.`);return;}
   const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19*1024,timeCost:2,parallelism:1});
   await client.query('BEGIN');
   try{
    // Lock the role row; insert only after guard and role resolved.
    const role=await client.query('SELECT role_id FROM public.roles WHERE name=$1 FOR SHARE',[a.role]);
    if(role.rowCount!==1)throw Error('Seed roles missing; run 001_roles.sql');
    const u=await client.query(`INSERT INTO public.users(first_name,last_name,email,role_id,status) VALUES($1,$2,$3,$4,'active') RETURNING user_id`,[a.first.trim(),a.last.trim(),a.email,role.rows[0].role_id]);
    await client.query(`INSERT INTO public.user_credentials(user_id,password_hash,email_verified_at) VALUES($1,$2,now())`,[u.rows[0].user_id,hash]);
    await client.query('COMMIT');
    console.log(`CREATED: ${a.email} as ${a.role} (test-only, preverified; no email sent).`);
   }catch(e){await client.query('ROLLBACK');throw e;}
  }finally{client.release();}
 }finally{await db.end();}
})().catch(e=>{console.error('PROVISION FAILED:',e.message);process.exitCode=1;});

// Shared local-only connection and safety checks for F00 Stage 2C.
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({path:path.resolve(__dirname,'..','.env')});
const { Pool } = require('pg');
function requireTestOptIn(){
  if (process.env.IMS_F00_TEST_MODE !== 'YES') throw Error('Set IMS_F00_TEST_MODE=YES only for disposable test project.');
  if (process.env.NODE_ENV === 'production') throw Error('Refusing to run with NODE_ENV=production.');
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is missing from backend/.env');
}
function pool(){
  requireTestOptIn();
  const ca = process.env.DATABASE_CA_CERT
    ? process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n')
    : fs.readFileSync(path.resolve(__dirname,'..','certs','prod-ca-2021.crt'),'utf8');
  return new Pool({connectionString:process.env.DATABASE_URL, ssl:{ca,rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000});
}
async function assertDemoGuard(client){
  const result=await client.query(`SELECT marker FROM public.f00_demo_environment_guard WHERE singleton=TRUE`);
  if(result.rowCount!==1 || result.rows[0].marker!=='F00_STAGE2C_DISPOSABLE_ONLY')
    throw Error('Disposable project marker missing. Run the explicit 003 test-only SQL first.');
}
// Read a password from STDIN, never from command-line arguments, a source file, or Git.
function readSecret(){
  if(process.stdin.isTTY) throw Error('Pipe a password via standard input (see README); do not pass as a CLI argument.');
  const text=fs.readFileSync(0,'utf8').replace(/\r?\n$/,'');
  if(text.length<12 || Buffer.byteLength(text,'utf8')>1024) throw Error('Use a unique password of at least 12 characters.');
  return text;
}
module.exports={pool,assertDemoGuard,readSecret,requireTestOptIn};

let instance;
let configPromise;
export class AIError extends Error {constructor(code,message){super(message);this.code=code;}}
export async function getConfig(){
  configPromise ||= fetch(new URL('./cloudbase-config.json',import.meta.url),{cache:'no-store'}).then(async r=>{
    if(!r.ok)throw new AIError('CONFIG_REQUIRED','尚未配置 CloudBase 连接，请按接入说明生成本机配置。');
    const c=await r.json();if(!c.enabled||!c.env||!c.accessKey||!c.functionName)throw new AIError('CONFIG_REQUIRED','尚未启用在线 AI，可以继续使用本地释放。');return c;
  }).catch(e=>{configPromise=null;throw e;});
  return configPromise;
}
async function connect(){
  if(instance)return instance;
  const config=await getConfig();
  const {default:cloudbase}=await import('./vendor/cloudbase-3.11.0.js');
  const app=cloudbase.init({env:config.env,region:config.region,accessKey:config.accessKey,timeout:85000,auth:{detectSessionInUrl:true}});
  const auth=typeof app.auth==='function'?app.auth():app.auth;
  instance={app,auth,config};
  auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')window.dispatchEvent(new Event('diudiu-signed-out'));});
  return instance;
}
export async function getSession(){const {auth}=await connect();const {data,error}=await auth.getSession();if(error)throw new AIError('AUTH_ERROR','暂时无法确认登录状态，请重试。');return data?.session||null;}
export async function signIn(username,password){const {auth}=await connect();const {error}=await auth.signInWithPassword({username,password});if(error)throw new AIError('AUTH_ERROR','登录未成功，请检查账号和密码，或联系应用管理员。');}
export async function signOut(){const {auth}=await connect();const {error}=await auth.signOut();if(error)throw new AIError('AUTH_ERROR','退出未成功，请重试。');}
export async function invokeAI(payload){
  const {app,config}=await connect();
  if(!await getSession())throw new AIError('AUTH_REQUIRED','请先登录，再使用在线 AI。');
  try {
    const response=await app.callFunction({name:config.functionName,data:{...payload,requestId:crypto.randomUUID()}});
    let result=response.result;
    if(typeof result==='string')result=JSON.parse(result);
    if(!result?.ok)throw new AIError(result?.error?.code||'SERVICE_UNAVAILABLE',result?.error?.message||'在线服务暂时不可用，请稍后重试。');
    return result;
  }catch(e){if(e instanceof AIError)throw e;throw new AIError('SERVICE_UNAVAILABLE','暂时连不上在线服务，内容仍在当前页面。请稍后重试。');}
}

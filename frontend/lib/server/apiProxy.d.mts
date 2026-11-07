export function proxyTarget(env:Record<string,string|undefined>,requestOrigin:string):string;
export function proxyApi(request:Request,options?:{env?:Record<string,string|undefined>;fetcher?:typeof fetch}):Promise<Response>;

import {uploadScanConfiguration} from './uploadScanConfig.js';
import {hostedEnvironment} from './deploymentMode.js';
/** Super-admin configuration diagnostics only. No probes, secrets or hostnames. */
export function uploadAvailability(env=process.env){
 const config=uploadScanConfiguration(env),localDevelopment=!hostedEnvironment(env);
 const scannerConfigured=config.provider==='cloudmersive'?config.errors.length===0:Boolean(env.CLAMAV_HOST);
 const developmentWithoutScanner=config.localUnscanned||(localDevelopment&&config.provider==='clamav'&&!env.CLAMAV_HOST&&!config.required);
 const configurationReady=config.enabled&&(config.localUnscanned||(!config.errors.length&&(scannerConfigured||developmentWithoutScanner)));
 let message;
 if(!config.enabled)message='New uploads are disabled by UPLOADS_ENABLED=false. Ask the server administrator to enable uploads after reviewing the scanner configuration.';
 else if(config.errors.length&&!config.localUnscanned)message='Upload scanner configuration needs attention: '+config.errors.join(' ');
 else if(!configurationReady)message='Uploads require a configured malware scanner. Set a reachable CLAMAV_HOST or configure the selected Cloudmersive provider; hosted scanning cannot be skipped.';
 else if(developmentWithoutScanner)message='Local development uploads are enabled without malware scanning. File type and image checks remain active. Configure a scanner before hosting this site.';
 else message='Upload scanner settings are present. The provider must also be reachable and its account allowance sufficient; each file is scanned before storage.';
 const code=!config.enabled?'UPLOADS_DISABLED':!configurationReady?'UPLOAD_SCAN_CONFIGURATION':developmentWithoutScanner?'LOCAL_UPLOADS_READY':'SCANNER_CHECK_REQUIRED';
 const localUploadCommand=localDevelopment&&!config.localUnscanned?'npm.cmd run uploads:local -- --apply':null;
 return {code,localUploadCommand,enabled:config.enabled,provider:config.provider,required:config.required,localDevelopment,scannerConfigured,developmentWithoutScanner,configurationReady,adminMediaProductLimit:Number(env.ADMIN_MEDIA_MAX_UPLOAD_MB||0)>0?'operator-configured':'none',providerSizeHintAppliesToAdmin:Number(env.ADMIN_MEDIA_MAX_UPLOAD_MB||0)>0,message:message+(configurationReady&&!developmentWithoutScanner?' Original admin media has no duration limit. With no admin product size cap, legacy Cloudmersive size hints do not block the transfer; the actual scanner must still accept and clean the complete file.':'')};
}

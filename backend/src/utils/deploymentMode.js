/** Defense in depth: contradictory settings must never lower runtime protections.
 * checkEnvironment rejects them before listening. These predicates are also used
 * by individual security paths, so isolated/imported app code remains fail-safe. */
export function deploymentStage(env=process.env){return env.DEPLOYMENT_STAGE||(env.NODE_ENV==='production'?'production':'development');}
export function hostedEnvironment(env=process.env){return env.NODE_ENV==='production'||['review','production'].includes(env.DEPLOYMENT_STAGE);}
export function liveEnvironment(env=process.env){return env.DEPLOYMENT_STAGE==='production'||(env.NODE_ENV==='production'&&env.DEPLOYMENT_STAGE!=='review');}

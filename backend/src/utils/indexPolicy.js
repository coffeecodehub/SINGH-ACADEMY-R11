/** Compare semantic index specifications, never index names alone. */
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function same(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
export function equivalentIndex(actual,key,options={}){
 return JSON.stringify(Object.entries(actual.key||{}))===JSON.stringify(Object.entries(key))&&
  Boolean(actual.unique)===Boolean(options.unique)&&Boolean(actual.sparse)===Boolean(options.sparse)&&
  same(actual.partialFilterExpression||null,options.partialFilterExpression||null)&&
  (actual.expireAfterSeconds??null)===(options.expireAfterSeconds??null)&&
  same(actual.collation||null,options.collation||null);
}
export function requiredIndexPlan(model,actual){
 return model.schema.indexes().map(([key,options])=>({collection:model.collection.name,key,options,
  status:actual.some(i=>equivalentIndex(i,key,options))?'present':'missing',
  conflicting:actual.filter(i=>JSON.stringify(Object.entries(i.key||{}))===JSON.stringify(Object.entries(key))&&!equivalentIndex(i,key,options)).map(i=>i.name)}));
}
